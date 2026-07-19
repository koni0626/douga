import { spawn, spawnSync } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { chromium } from "@playwright/test";

import {
  buildRenderAssetUrls,
  renderAssetPathPrefix,
  resolveRenderAssetFile,
} from "./render-assets.mjs";
import {
  buildFfmpegArgs,
  captureProcessResult,
  endFrameStream,
  writeFrame,
} from "./render-stream.mjs";

const inputPath = process.argv[2];
if (!inputPath) throw new Error("Usage: render-project.mjs <input.json>");
const input = JSON.parse(await readFile(inputPath, "utf8"));
const root = path.resolve(import.meta.dirname, "..");
const serverUrl = "http://127.0.0.1:4174/?render=1";
const progressPrefix = "DOUGA_PROGRESS=";
const webRoot = path.join(root, "apps", "web");
const viteEntrypoint = path.join(
  webRoot,
  "node_modules",
  "vite",
  "bin",
  "vite.js",
);

async function waitForServer(url) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function stopProcess(child) {
  if (!child.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
    });
  } else child.kill("SIGTERM");
}

let lastProgress = -1;
let lastProgressSignalAt = 0;
function emitProgress(progress) {
  const normalized = Math.max(0, Math.min(100, Math.round(progress)));
  const now = Date.now();
  if (normalized < lastProgress) return;
  if (normalized === lastProgress && now - lastProgressSignalAt < 5_000) return;
  lastProgress = Math.max(lastProgress, normalized);
  lastProgressSignalAt = now;
  process.stderr.write(`${progressPrefix}${normalized}\n`);
}

function countFramesInRange(sceneDurationsMs, fps, rangeStartMs, rangeEndMs) {
  let count = 0;
  let sceneOffsetMs = 0;
  for (const durationMs of sceneDurationsMs) {
    const sceneFrames = Math.max(1, Math.ceil((durationMs / 1000) * fps));
    for (let frame = 0; frame < sceneFrames; frame += 1) {
      const globalTimeMs = sceneOffsetMs + Math.round((frame * 1000) / fps);
      if (globalTimeMs >= rangeStartMs && globalTimeMs < rangeEndMs) count += 1;
    }
    sceneOffsetMs += durationMs;
  }
  return count;
}

await mkdir(path.dirname(input.output_path), { recursive: true });
const server = spawn(
  process.execPath,
  [viteEntrypoint, "--host", "127.0.0.1", "--port", "4174"],
  {
    cwd: webRoot,
    stdio: ["ignore", "pipe", "pipe"],
  },
);

let browser;
let ffmpeg;
try {
  await waitForServer(serverUrl);
  browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL ?? "msedge",
    headless: true,
  });
  const { width, height, fps } = input.project.video;
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 1,
  });
  const imageFiles = input.image_files ?? {};
  const serverOrigin = new URL(serverUrl).origin;
  const assetUrls = buildRenderAssetUrls(imageFiles, serverOrigin);
  await page.route(
    `${serverOrigin}${renderAssetPathPrefix}**`,
    async (route) => {
      const imageFile = resolveRenderAssetFile(
        imageFiles,
        route.request().url(),
      );
      if (!imageFile) {
        await route.abort("blockedbyclient");
        return;
      }
      await route.fulfill({
        path: imageFile.path,
        contentType: imageFile.mime_type ?? "application/octet-stream",
      });
    },
  );
  await page.addInitScript(
    ({ project, assets }) => {
      window.__DOUGA_RENDER_PROJECT__ = project;
      window.__DOUGA_RENDER_ASSETS__ = assets;
    },
    {
      project: input.project,
      assets: Object.keys(assetUrls).length
        ? assetUrls
        : (input.asset_data_urls ?? {}),
    },
  );
  await page.goto(serverUrl, { waitUntil: "networkidle" });
  const canvas = page.locator("[data-render-canvas]");
  await canvas.waitFor();
  const info = await page.evaluate(() => window.__DOUGA_RENDER_INFO__);
  if (!info) throw new Error("Renderer did not expose timeline information");

  const rangeStartMs = input.range_start_ms ?? 0;
  const rangeEndMs = input.range_end_ms ?? Number.POSITIVE_INFINITY;
  const totalFrames = countFramesInRange(
    info.sceneDurationsMs,
    fps,
    rangeStartMs,
    rangeEndMs,
  );
  if (totalFrames === 0) throw new Error("Render range produced no frames");
  const durationSeconds = totalFrames / fps;
  const ffmpegArgs = buildFfmpegArgs(input, { fps, durationSeconds });
  ffmpeg = spawn(input.ffmpeg_path ?? "ffmpeg", ffmpegArgs, {
    stdio: ["pipe", "ignore", "pipe"],
  });
  if (!ffmpeg.stdin) throw new Error("FFmpeg input pipe was not created");
  ffmpeg.stdin.on("error", () => {
    // writeFrame reports the same pipe failure to the render loop.
  });
  const ffmpegResult = captureProcessResult(ffmpeg);
  ffmpegResult.completion.catch(() => {
    // The failure is observed after the input stream is closed or by writeFrame.
  });
  emitProgress(5);
  let frameNumber = 0;
  let sceneOffsetMs = 0;
  for (
    let sceneIndex = 0;
    sceneIndex < info.sceneDurationsMs.length;
    sceneIndex += 1
  ) {
    const durationMs = info.sceneDurationsMs[sceneIndex];
    const sceneFrames = Math.max(1, Math.ceil((durationMs / 1000) * fps));
    for (let frame = 0; frame < sceneFrames; frame += 1) {
      const timeMs = Math.round((frame * 1000) / fps);
      const globalTimeMs = sceneOffsetMs + timeMs;
      if (globalTimeMs < rangeStartMs || globalTimeMs >= rangeEndMs) continue;
      await page.evaluate(
        ({ sceneIndex, timeMs }) => {
          window.__DOUGA_SET_RENDER_SCENE__?.(sceneIndex);
          window.__DOUGA_SET_RENDER_TIME__?.(timeMs);
        },
        { sceneIndex, timeMs },
      );
      await page.evaluate(async () => {
        await globalThis.document.fonts.ready;
        await new Promise((resolve) => requestAnimationFrame(() => resolve()));
      });
      const renderedFrame = await canvas.screenshot({ type: "png" });
      await writeFrame(ffmpeg.stdin, renderedFrame);
      frameNumber += 1;
      const frameProgress = Math.min(
        90,
        Math.floor(5 + (frameNumber / totalFrames) * 85),
      );
      emitProgress(frameProgress);
    }
    sceneOffsetMs += durationMs;
  }
  emitProgress(92);
  await endFrameStream(ffmpeg.stdin);
  await ffmpegResult.completion;
  emitProgress(99);
  process.stdout.write(
    JSON.stringify({
      frame_count: frameNumber,
      duration_ms: Math.round((frameNumber / fps) * 1000),
    }),
  );
} finally {
  if (browser) await browser.close();
  if (ffmpeg?.exitCode === null) stopProcess(ffmpeg);
  stopProcess(server);
}
