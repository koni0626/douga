import { once } from "node:events";

const maxDiagnosticCharacters = 4_000;

export function buildFfmpegArgs(input, { fps, durationSeconds }) {
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "image2pipe",
    "-framerate",
    String(fps),
    "-vcodec",
    "png",
    "-i",
    "pipe:0",
  ];
  const audio = input.audio_inputs ?? [];
  for (const track of audio) {
    if (track.loop) args.push("-stream_loop", "-1");
    args.push("-i", track.path);
  }
  if (audio.length) {
    const filters = audio.map((track, index) => {
      const chain = [];
      if (track.trim_start_ms > 0) {
        chain.push(
          `atrim=start=${track.trim_start_ms / 1000}`,
          "asetpts=PTS-STARTPTS",
        );
      }
      chain.push(`volume=${Math.max(0, Math.min(2, track.volume))}`);
      if (track.fade_in_ms > 0) {
        chain.push(`afade=t=in:st=0:d=${track.fade_in_ms / 1000}`);
      }
      if (track.fade_out_ms > 0 && track.duration_ms > 0) {
        chain.push(
          `afade=t=out:st=${Math.max(0, track.duration_ms - track.fade_out_ms) / 1000}:d=${track.fade_out_ms / 1000}`,
        );
      }
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
  } else {
    args.push("-an");
  }
  args.push(
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-t",
    String(durationSeconds),
    "-y",
    input.output_path,
  );
  return args;
}

export async function writeFrame(stream, frame) {
  if (stream.destroyed || stream.writableEnded) {
    throw new Error("FFmpeg input stream closed before rendering completed");
  }
  await new Promise((resolve, reject) => {
    stream.write(frame, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

export async function endFrameStream(stream) {
  if (stream.destroyed || stream.writableEnded) return;
  const finished = once(stream, "finish");
  stream.end();
  await finished;
}

export function captureProcessResult(child) {
  let diagnostic = "";
  child.stderr?.on("data", (chunk) => {
    diagnostic = (diagnostic + chunk.toString())
      .slice(-maxDiagnosticCharacters)
      .trimStart();
  });
  const completion = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      const status = signal ? `signal ${signal}` : `code ${code}`;
      reject(
        new Error(
          diagnostic ||
            `FFmpeg exited with ${status} without diagnostic output`,
        ),
      );
    });
  });
  return { completion, diagnostic: () => diagnostic };
}
