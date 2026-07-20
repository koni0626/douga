import type { ProjectDocument } from "@douga/project-schema";
import type { WebGlAssetUrlResolver } from "@douga/scene-renderer";
import type { AudioBufferSource as MediaAudioBufferSource } from "mediabunny";

import {
  BrowserExportError,
  throwIfBrowserExportCanceled,
} from "./browserExportError";

export const AUDIO_SAMPLE_RATE = 48_000;
const AUDIO_CHUNK_SECONDS = 5;
const MAX_DECODED_AUDIO_CACHE_BYTES = 96 * 1024 * 1024;

type AudioTrack = NonNullable<ProjectDocument["audio_tracks"]>[number];

interface DecodedAudioTrack {
  track: AudioTrack;
  buffer: AudioBuffer;
}

interface CachedAudioBuffer {
  buffer: AudioBuffer;
  byteLength: number;
  lastUsed: number;
}

function decodedAudioByteLength(buffer: AudioBuffer) {
  return (
    buffer.length * buffer.numberOfChannels * Float32Array.BYTES_PER_ELEMENT
  );
}

class DecodedAudioCache {
  private readonly context = new AudioContext({
    sampleRate: AUDIO_SAMPLE_RATE,
  });
  private readonly entries = new Map<string, CachedAudioBuffer>();
  private sequence = 0;

  async get(
    assetId: string,
    assetUrl: WebGlAssetUrlResolver,
    signal?: AbortSignal,
  ) {
    const cached = this.entries.get(assetId);
    if (cached) {
      cached.lastUsed = this.sequence += 1;
      return cached.buffer;
    }
    const url = assetUrl(assetId);
    if (!url) {
      throw new BrowserExportError(
        "asset_load_failed",
        "An audio asset URL could not be resolved",
      );
    }
    const response = await fetch(url, { credentials: "include", signal });
    if (!response.ok) {
      throw new BrowserExportError(
        "asset_load_failed",
        `Unable to load audio asset (${response.status})`,
      );
    }
    try {
      const buffer = await this.context.decodeAudioData(
        await response.arrayBuffer(),
      );
      this.entries.set(assetId, {
        buffer,
        byteLength: decodedAudioByteLength(buffer),
        lastUsed: (this.sequence += 1),
      });
      return buffer;
    } catch (error) {
      throw new BrowserExportError(
        "audio_decode_failed",
        "The browser could not decode an audio asset",
        { cause: error },
      );
    }
  }

  evict(protectedAssetIds: Set<string>) {
    let totalBytes = [...this.entries.values()].reduce(
      (total, entry) => total + entry.byteLength,
      0,
    );
    const candidates = [...this.entries.entries()]
      .filter(([assetId]) => !protectedAssetIds.has(assetId))
      .sort((left, right) => left[1].lastUsed - right[1].lastUsed);
    for (const [assetId, entry] of candidates) {
      if (totalBytes <= MAX_DECODED_AUDIO_CACHE_BYTES) break;
      this.entries.delete(assetId);
      totalBytes -= entry.byteLength;
    }
  }

  async close() {
    this.entries.clear();
    await this.context.close();
  }
}

function configuredTrackDurationSeconds(
  track: AudioTrack,
  totalDurationSeconds: number,
) {
  return track.duration_ms === undefined
    ? Math.max(0, totalDurationSeconds - track.start_ms / 1000)
    : track.duration_ms / 1000;
}

function trackDurationSeconds(
  item: DecodedAudioTrack,
  totalDurationSeconds: number,
): number {
  if (item.track.duration_ms !== undefined) {
    return item.track.duration_ms / 1000;
  }
  const remaining = Math.max(
    0,
    item.buffer.duration - item.track.trim_start_ms / 1000,
  );
  return item.track.loop
    ? Math.max(0, totalDurationSeconds - item.track.start_ms / 1000)
    : remaining;
}

function trackOverlapsChunk(
  track: AudioTrack,
  chunkStart: number,
  chunkEnd: number,
  totalDurationSeconds: number,
) {
  const start = track.start_ms / 1000;
  const end =
    start + configuredTrackDurationSeconds(track, totalDurationSeconds);
  return start < chunkEnd && end > chunkStart;
}

function trackVolumeAt(
  item: DecodedAudioTrack,
  timeSeconds: number,
  totalDurationSeconds: number,
  narration: AudioTrack[],
): number {
  const trackStart = item.track.start_ms / 1000;
  const duration = trackDurationSeconds(item, totalDurationSeconds);
  const trackEnd = trackStart + duration;
  const elapsed = timeSeconds - trackStart;
  let volume = Math.max(0, Math.min(2, item.track.volume));
  const fadeIn = item.track.fade_in_ms / 1000;
  const fadeOut = item.track.fade_out_ms / 1000;
  if (fadeIn > 0) volume *= Math.max(0, Math.min(1, elapsed / fadeIn));
  if (fadeOut > 0) {
    volume *= Math.max(0, Math.min(1, (trackEnd - timeSeconds) / fadeOut));
  }
  if (
    item.track.role === "bgm" &&
    item.track.ducking &&
    narration.some((voice) => {
      const start = voice.start_ms / 1000;
      const end =
        start + configuredTrackDurationSeconds(voice, totalDurationSeconds);
      return timeSeconds >= start && timeSeconds < end;
    })
  ) {
    volume *= 0.35;
  }
  return volume;
}

function gainChangePoints(
  item: DecodedAudioTrack,
  overlapStart: number,
  overlapEnd: number,
  totalDurationSeconds: number,
  narration: AudioTrack[],
) {
  const start = item.track.start_ms / 1000;
  const end = start + trackDurationSeconds(item, totalDurationSeconds);
  const points = new Set([overlapStart, overlapEnd]);
  const candidates = [
    start + item.track.fade_in_ms / 1000,
    end - item.track.fade_out_ms / 1000,
  ];
  if (item.track.role === "bgm" && item.track.ducking) {
    for (const voice of narration) {
      const voiceStart = voice.start_ms / 1000;
      candidates.push(
        voiceStart,
        voiceStart +
          configuredTrackDurationSeconds(voice, totalDurationSeconds),
      );
    }
  }
  for (const candidate of candidates) {
    if (candidate > overlapStart && candidate < overlapEnd)
      points.add(candidate);
  }
  return [...points].sort((left, right) => left - right);
}

function scheduleAudioTrack(
  context: OfflineAudioContext,
  item: DecodedAudioTrack,
  chunkStart: number,
  chunkEnd: number,
  totalDurationSeconds: number,
  narration: AudioTrack[],
) {
  const trackStart = item.track.start_ms / 1000;
  const trackEnd =
    trackStart + trackDurationSeconds(item, totalDurationSeconds);
  const overlapStart = Math.max(chunkStart, trackStart);
  const overlapEnd = Math.min(chunkEnd, trackEnd);
  if (overlapEnd <= overlapStart) return;
  const trimStart = item.track.trim_start_ms / 1000;
  const playableDuration = item.buffer.duration - trimStart;
  if (playableDuration <= 0) return;
  const elapsed = overlapStart - trackStart;
  const offset = item.track.loop
    ? trimStart + (elapsed % playableDuration)
    : trimStart + elapsed;
  if (!item.track.loop && offset >= item.buffer.duration) return;
  const requestedDuration = overlapEnd - overlapStart;
  const duration = item.track.loop
    ? requestedDuration
    : Math.min(requestedDuration, item.buffer.duration - offset);
  if (duration <= 0) return;

  const source = context.createBufferSource();
  source.buffer = item.buffer;
  source.loop = item.track.loop;
  if (item.track.loop) {
    source.loopStart = trimStart;
    source.loopEnd = item.buffer.duration;
  }
  const gain = context.createGain();
  const points = gainChangePoints(
    item,
    overlapStart,
    overlapStart + duration,
    totalDurationSeconds,
    narration,
  );
  points.forEach((point, index) => {
    const localTime = point - chunkStart;
    const value = trackVolumeAt(item, point, totalDurationSeconds, narration);
    if (index === 0) gain.gain.setValueAtTime(value, localTime);
    else gain.gain.linearRampToValueAtTime(value, localTime);
  });
  source.connect(gain).connect(context.destination);
  source.start(overlapStart - chunkStart, offset, duration);
}

async function loadChunkTracks(
  tracks: AudioTrack[],
  cache: DecodedAudioCache,
  assetUrl: WebGlAssetUrlResolver,
  signal?: AbortSignal,
) {
  const assetIds = [...new Set(tracks.map((track) => track.asset_id))];
  const buffers = new Map(
    await Promise.all(
      assetIds.map(
        async (assetId) =>
          [assetId, await cache.get(assetId, assetUrl, signal)] as const,
      ),
    ),
  );
  return tracks.flatMap((track) => {
    const buffer = buffers.get(track.asset_id);
    return buffer ? [{ track, buffer }] : [];
  });
}

export async function addMixedProjectAudio(
  project: ProjectDocument,
  assetUrl: WebGlAssetUrlResolver,
  source: MediaAudioBufferSource,
  totalDurationSeconds: number,
  signal?: AbortSignal,
) {
  const tracks = project.audio_tracks ?? [];
  const narration = tracks.filter((track) => track.role === "narration");
  const cache = new DecodedAudioCache();
  try {
    for (
      let chunkStart = 0;
      chunkStart < totalDurationSeconds;
      chunkStart += AUDIO_CHUNK_SECONDS
    ) {
      throwIfBrowserExportCanceled(signal);
      const chunkEnd = Math.min(
        totalDurationSeconds,
        chunkStart + AUDIO_CHUNK_SECONDS,
      );
      const activeTracks = tracks.filter((track) =>
        trackOverlapsChunk(track, chunkStart, chunkEnd, totalDurationSeconds),
      );
      const decoded = await loadChunkTracks(
        activeTracks,
        cache,
        assetUrl,
        signal,
      );
      const frameCount = Math.max(
        1,
        Math.round((chunkEnd - chunkStart) * AUDIO_SAMPLE_RATE),
      );
      const context = new OfflineAudioContext(2, frameCount, AUDIO_SAMPLE_RATE);
      for (const item of decoded) {
        scheduleAudioTrack(
          context,
          item,
          chunkStart,
          chunkEnd,
          totalDurationSeconds,
          narration,
        );
      }
      await source.add(await context.startRendering());
      cache.evict(new Set(activeTracks.map((track) => track.asset_id)));
    }
    source.close();
  } finally {
    await cache.close();
  }
}
