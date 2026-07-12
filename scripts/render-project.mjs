import { spawn, spawnSync } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { chromium } from "@playwright/test";

const inputPath = process.argv[2];
if (!inputPath) throw new Error("Usage: render-project.mjs <input.json>");
const input = JSON.parse(await readFile(inputPath, "utf8"));
const root = path.resolve(import.meta.dirname, "..");
const framesDir = path.join(path.dirname(inputPath), "frames");
const serverUrl = "http://127.0.0.1:4174/?render=1";
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

await rm(framesDir, { recursive: true, force: true });
await mkdir(framesDir, { recursive: true });
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
  await page.addInitScript(
    ({ project, assets }) => {
      window.__DOUGA_RENDER_PROJECT__ = project;
      window.__DOUGA_RENDER_ASSETS__ = assets;
    },
    { project: input.project, assets: input.asset_data_urls },
  );
  await page.goto(serverUrl, { waitUntil: "networkidle" });
  const canvas = page.locator("[data-render-canvas]");
  await canvas.waitFor();
  const info = await page.evaluate(() => window.__DOUGA_RENDER_INFO__);
  if (!info) throw new Error("Renderer did not expose timeline information");

  const rangeStartMs = input.range_start_ms ?? 0;
  const rangeEndMs = input.range_end_ms ?? Number.POSITIVE_INFINITY;
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
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => resolve())),
      );
      await canvas.screenshot({
        path: path.join(
          framesDir,
          `frame-${String(frameNumber).padStart(7, "0")}.png`,
        ),
      });
      frameNumber += 1;
    }
    sceneOffsetMs += durationMs;
  }
  if (frameNumber === 0) throw new Error("Render range produced no frames");

  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-framerate",
    String(fps),
    "-i",
    path.join(framesDir, "frame-%07d.png"),
  ];
  const audio = input.audio_inputs ?? [];
  for (const track of audio) {
    if (track.loop) args.push("-stream_loop", "-1");
    args.push("-i", track.path);
  }
  if (audio.length) {
    const filters = audio.map((track, index) => {
      const chain = [];
      if (track.trim_start_ms > 0)
        chain.push(
          `atrim=start=${track.trim_start_ms / 1000}`,
          "asetpts=PTS-STARTPTS",
        );
      chain.push(`volume=${Math.max(0, Math.min(2, track.volume))}`);
      if (track.fade_in_ms > 0)
        chain.push(`afade=t=in:st=0:d=${track.fade_in_ms / 1000}`);
      if (track.fade_out_ms > 0 && track.duration_ms > 0)
        chain.push(
          `afade=t=out:st=${Math.max(0, track.duration_ms - track.fade_out_ms) / 1000}:d=${track.fade_out_ms / 1000}`,
        );
      const delay = Math.max(0, track.start_ms);
      chain.push(`adelay=${delay}|${delay}`);
      return `[${index + 1}:a]${chain.join(",")}[a${index}]`;
    });
    filters.push(
      `${audio.map((_, index) => `[a${index}]`).join("")}amix=inputs=${audio.length}:normalize=0[aout]`,
    );
    args.push(
      "-filter_complex",
      filters.join(";"),
      "-map",
      "0:v",
      "-map",
      "[aout]",
    );
  } else args.push("-an");
  args.push(
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-t",
    String(frameNumber / fps),
    "-y",
    input.output_path,
  );
  const result = spawnSync(input.ffmpeg_path ?? "ffmpeg", args, {
    encoding: "utf8",
  });
  if (result.status !== 0)
    throw new Error(result.stderr || `FFmpeg failed: ${result.status}`);
  process.stdout.write(
    JSON.stringify({
      frame_count: frameNumber,
      duration_ms: Math.round((frameNumber / fps) * 1000),
    }),
  );
} finally {
  if (browser) await browser.close();
  stopProcess(server);
  await rm(framesDir, { recursive: true, force: true });
}
