import { spawn, spawnSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { chromium } from "@playwright/test";

const root = path.resolve(import.meta.dirname, "..");
const outputRoot = path.join(root, ".local-data", "render-spike");
const framesDir = path.join(outputRoot, "frames");
const serverUrl = "http://127.0.0.1:4173/?render=1";
const webRoot = path.join(root, "apps", "web");
const viteEntrypoint = path.join(
  webRoot,
  "node_modules",
  "vite",
  "bin",
  "vite.js",
);

async function waitForServer(url, attempts = 120) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The server is still starting.
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
  } else {
    child.kill("SIGTERM");
  }
}

await rm(outputRoot, { recursive: true, force: true });
await mkdir(framesDir, { recursive: true });

const server = spawn(
  process.execPath,
  [viteEntrypoint, "--host", "127.0.0.1", "--port", "4173"],
  { cwd: webRoot, stdio: ["ignore", "pipe", "pipe"] },
);

let browser;
try {
  await waitForServer(serverUrl);
  browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL ?? "msedge",
    headless: true,
  });
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  await page.goto(serverUrl, { waitUntil: "networkidle" });
  const canvas = page.locator("[data-render-canvas]");
  await canvas.waitFor();

  const fps = 30;
  const seconds = 5;
  const frameCount = fps * seconds;
  for (let frame = 0; frame < frameCount; frame += 1) {
    const timeMs = Math.round((frame * 1000) / fps);
    await page.evaluate(
      (value) => window.__DOUGA_SET_RENDER_TIME__?.(value),
      timeMs,
    );
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => resolve(undefined)),
        ),
    );
    await canvas.screenshot({
      path: path.join(framesDir, `frame-${String(frame).padStart(4, "0")}.png`),
    });
  }

  const ffmpeg = process.env.FFMPEG_PATH ?? "ffmpeg";
  const outputVideo = path.join(outputRoot, "renderer-spike.mp4");
  const ffmpegResult = spawnSync(
    ffmpeg,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-framerate",
      String(fps),
      "-i",
      path.join(framesDir, "frame-%04d.png"),
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-y",
      outputVideo,
    ],
    { cwd: root, encoding: "utf8" },
  );
  if (ffmpegResult.status !== 0) {
    throw new Error(
      ffmpegResult.stderr || `FFmpeg failed with status ${ffmpegResult.status}`,
    );
  }

  const probe = spawnSync(
    process.env.FFPROBE_PATH ?? "ffprobe",
    [
      "-v",
      "error",
      "-show_streams",
      "-show_format",
      "-of",
      "json",
      outputVideo,
    ],
    { encoding: "utf8" },
  );
  if (probe.status !== 0) {
    throw new Error(
      probe.stderr || `FFprobe failed with status ${probe.status}`,
    );
  }
  await writeFile(path.join(outputRoot, "ffprobe.json"), probe.stdout, "utf8");
  process.stdout.write(`${outputVideo}\n`);
} finally {
  if (browser) await browser.close();
  stopProcess(server);
}
