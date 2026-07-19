import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { PassThrough } from "node:stream";
import test from "node:test";

import {
  buildFfmpegArgs,
  endFrameStream,
  writeFrame,
} from "./render-stream.mjs";

test("buildFfmpegArgs consumes streamed PNG frames from stdin", () => {
  const args = buildFfmpegArgs(
    { output_path: "output.mp4", audio_inputs: [] },
    { fps: 10, durationSeconds: 5 },
  );

  assert.deepEqual(args.slice(0, 12), [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "image2pipe",
    "-framerate",
    "10",
    "-vcodec",
    "png",
    "-i",
    "pipe:0",
    "-an",
  ]);
  assert.equal(args.includes("frame-%07d.png"), false);
  assert.equal(args.at(-1), "output.mp4");
});

test("writeFrame and endFrameStream send frames without retaining them", async () => {
  const stream = new PassThrough();
  const chunks = [];
  stream.on("data", (chunk) => chunks.push(chunk));

  await writeFrame(stream, Buffer.from("first"));
  await writeFrame(stream, Buffer.from("second"));
  await endFrameStream(stream);

  assert.equal(Buffer.concat(chunks).toString(), "firstsecond");
  assert.equal(stream.writableEnded, true);
});
