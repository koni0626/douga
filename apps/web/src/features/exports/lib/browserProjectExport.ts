import type { ProjectDocument } from "@douga/project-schema";
import {
  resolveSceneDurationMs,
  WebGlProjectRenderer,
  type WebGlAssetUrlResolver,
} from "@douga/scene-renderer";
import {
  AudioBufferSource as MediaAudioBufferSource,
  BufferTarget,
  canEncodeAudio,
  canEncodeVideo,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  StreamTarget,
  type StreamTargetChunk,
} from "mediabunny";

import { addMixedProjectAudio, AUDIO_SAMPLE_RATE } from "./browserAudioMix";
import {
  BrowserExportError,
  throwIfBrowserExportCanceled,
} from "./browserExportError";
import { browserExportSupported } from "./browserExportSupport";

export { BrowserExportError } from "./browserExportError";
export type { BrowserExportErrorCode } from "./browserExportError";
export { browserExportSupported } from "./browserExportSupport";

export interface BrowserProjectExportOptions {
  project: ProjectDocument;
  assetUrl: WebGlAssetUrlResolver;
  width: number;
  height: number;
  fps: number;
  writable?: WritableStream<StreamTargetChunk>;
  signal?: AbortSignal;
  onProgress?: (progressPercent: number) => void;
}

async function ensureCodecSupport(
  width: number,
  height: number,
  includeAudio: boolean,
) {
  const [videoSupported, audioSupported] = await Promise.all([
    canEncodeVideo("avc", {
      width,
      height,
      bitrate: QUALITY_HIGH,
      hardwareAcceleration: "prefer-hardware",
    }),
    includeAudio
      ? canEncodeAudio("aac", {
          numberOfChannels: 2,
          sampleRate: AUDIO_SAMPLE_RATE,
          bitrate: 192_000,
        })
      : Promise.resolve(true),
  ]);
  if (!videoSupported || !audioSupported) {
    throw new BrowserExportError(
      "unsupported",
      "This browser cannot encode the requested MP4 video",
    );
  }
}

export async function exportProjectInBrowser({
  project,
  assetUrl,
  width,
  height,
  fps,
  writable,
  signal,
  onProgress,
}: BrowserProjectExportOptions): Promise<Blob | undefined> {
  if (!browserExportSupported(project)) {
    throw new BrowserExportError(
      "unsupported",
      "This browser does not support WebGL 2 and WebCodecs export",
    );
  }
  await ensureCodecSupport(
    width,
    height,
    (project.audio_tracks?.length ?? 0) > 0,
  );
  const canvas = document.createElement("canvas");
  const renderer = new WebGlProjectRenderer(
    canvas,
    project.video.width,
    project.video.height,
  );
  renderer.resize(width, height, project.video.width, project.video.height);
  const bufferTarget = new BufferTarget();
  const target = writable
    ? new StreamTarget(writable, {
        chunked: true,
        chunkSize: 4 * 1024 * 1024,
      })
    : bufferTarget;
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: false }),
    target,
  });
  const videoSource = new CanvasSource(canvas, {
    codec: "avc",
    bitrate: QUALITY_HIGH,
    keyFrameInterval: 2,
    hardwareAcceleration: "prefer-hardware",
  });
  const sceneDurations = project.scenes.map((_, index) =>
    resolveSceneDurationMs(project, index),
  );
  const frameCounts = sceneDurations.map((durationMs) =>
    Math.max(1, Math.ceil((durationMs / 1000) * fps)),
  );
  const totalFrames = frameCounts.reduce((total, count) => total + count, 0);
  const totalDurationSeconds = totalFrames / fps;
  output.addVideoTrack(videoSource, { frameRate: fps });
  const audioSource =
    (project.audio_tracks?.length ?? 0) > 0
      ? new MediaAudioBufferSource({ codec: "aac", bitrate: 192_000 })
      : undefined;
  if (audioSource) output.addAudioTrack(audioSource);

  let stage = "prepare_assets";
  try {
    throwIfBrowserExportCanceled(signal);
    await Promise.all([
      document.fonts.ready,
      renderer.prepare(project, assetUrl),
    ]);
    stage = "start_output";
    await output.start();
    stage = "encode_media";
    let writtenFrames = 0;
    const videoTask = (async () => {
      for (
        let sceneIndex = 0;
        sceneIndex < project.scenes.length;
        sceneIndex += 1
      ) {
        const frameCount = frameCounts[sceneIndex] ?? 0;
        for (let frame = 0; frame < frameCount; frame += 1) {
          throwIfBrowserExportCanceled(signal);
          renderer.renderFrame(project, sceneIndex, (frame * 1000) / fps);
          const timestamp = writtenFrames / fps;
          await videoSource.add(timestamp, 1 / fps);
          writtenFrames += 1;
          onProgress?.(Math.floor((writtenFrames / totalFrames) * 95));
        }
      }
      videoSource.close();
    })();
    const audioTask = audioSource
      ? addMixedProjectAudio(
          project,
          assetUrl,
          audioSource,
          totalDurationSeconds,
          signal,
        )
      : Promise.resolve();
    await Promise.all([videoTask, audioTask]);
    stage = "finalize_output";
    await output.finalize();
    if (writable) {
      onProgress?.(100);
      return undefined;
    }
    if (!bufferTarget.buffer) {
      throw new BrowserExportError(
        "encode_failed",
        "MP4 output buffer is empty",
      );
    }
    onProgress?.(100);
    return new Blob([bufferTarget.buffer], {
      type: await output.getMimeType(),
    });
  } catch (error) {
    if (output.state !== "finalized" && output.state !== "canceled") {
      try {
        await output.cancel();
      } catch {
        // Preserve the original export failure. Cancellation is best-effort.
      }
    }
    if (error instanceof BrowserExportError) throw error;
    throw new BrowserExportError(
      signal?.aborted ? "canceled" : "encode_failed",
      `Browser video export failed during ${stage}`,
      { cause: error },
    );
  } finally {
    renderer.dispose();
  }
}

export function downloadBrowserExport(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.toLowerCase().endsWith(".mp4")
    ? filename
    : `${filename}.mp4`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
