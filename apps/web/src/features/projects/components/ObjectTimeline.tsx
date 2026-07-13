import {
  type CSSProperties,
  type PointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import type { ProjectDocument } from "@douga/project-schema";
import type { LayerEasing } from "@douga/scene-renderer";

import type { CaptionTimelineClip } from "../lib/captionTimeline";
import { timelineMenuPosition } from "../lib/timelineMenuPosition";
import type { TimelineRange } from "../lib/timelineRange";
import {
  followPlayheadScroll,
  TIMELINE_LABEL_WIDTH_PX,
  TIMELINE_SECOND_WIDTH_PX,
  timelineTrackWidth,
} from "../lib/timelineViewport";
import { CaptionTimelineTrack } from "./CaptionTimelineTrack";
import type { KeyframeLabels } from "./KeyframePopover";
import { LayerTimelineTracks } from "./LayerTimelineTracks";
import {
  AudioTimelineTracks,
  CameraTimelineTrack,
} from "./MediaTimelineTracks";
import {
  TimelineContextMenu,
  type TimelineMenuState,
} from "./TimelineContextMenu";
import { TimelineHeader } from "./TimelineHeader";

type Layer = ProjectDocument["scenes"][number]["layers"][number];
type CameraEffect = NonNullable<ProjectDocument["camera_effects"]>[number];
type AudioTrack = NonNullable<ProjectDocument["audio_tracks"]>[number];
const DEFAULT_TIMELINE_HEIGHT_PX = 180;
const MIN_TIMELINE_HEIGHT_PX = 96;
const TIMELINE_VIEWPORT_RESERVE_PX = 360;

export interface ObjectTimelineProps {
  durationMs: number;
  cameraEffects: CameraEffect[];
  cameraEffectLabel: (effect: CameraEffect) => string;
  cameraLabel: string;
  captions: CaptionTimelineClip[];
  captionTrackLabel: string;
  captionTrackEmptyLabel: string;
  captionInputLabel: string;
  captionDeleteLabel: string;
  formatCaptionDuration: (durationMs: number) => string;
  audioLabel: string;
  audioTracks: AudioTrack[];
  audioTrackLabel: (track: AudioTrack) => string;
  layers: Layer[];
  playing: boolean;
  selectedLayerId?: string;
  timeMs: number;
  labelFor: (layer: Layer) => string;
  onChange: (layerId: string, range: TimelineRange) => void;
  onAudioStartChange: (trackId: string, startMs: number) => void;
  onAddCamera: () => void;
  onAddCaption: (startMs: number) => void;
  onAddTextHorizontal: () => void;
  onAddTextVertical: () => void;
  onAddShape: () => void;
  onOpenAudioSettings: () => void;
  onOpenCameraSettings: () => void;
  onOpenCaptionSettings: () => void;
  onCaptionChange: (captionId: string, range: TimelineRange) => void;
  onCaptionDelete: (captionId: string) => void;
  onCaptionTextChange: (captionId: string, text: string) => void;
  onOpenLayerSettings: () => void;
  onExtend: () => void;
  onPlay: () => void;
  onDeleteKeyframe: (layerId: string, keyframeId: string) => void;
  onDeleteLayer: (layerId: string) => void;
  onDuplicateKeyframe: (
    layerId: string,
    keyframeId: string,
    timeMs: number,
  ) => void;
  onKeyframeEasingChange: (
    layerId: string,
    keyframeId: string,
    easing: LayerEasing,
  ) => void;
  onMergeTrack: (sourceLayerId: string, targetLayerId: string) => void;
  onMoveToTrack: (
    layerId: string,
    targetLayerId: string,
    range: TimelineRange,
  ) => void;
  onReorder: (
    sourceIndex: number,
    targetIndex: number,
    position: "before" | "after",
  ) => void;
  onRename: (layerId: string, name?: string) => void;
  onSelect: (layerId: string) => void;
  onSplitTrack: (layerId: string) => void;
  onSeek: (timeMs: number) => void;
  onStop: () => void;
  collapseLabel: string;
  expandLabel: string;
  extendLabel: string;
  resizeLabel: string;
  playLabel: string;
  seekLabel: string;
  stopLabel: string;
  title: string;
  renameLabel: string;
  keyframeLabels: KeyframeLabels;
  mergeAboveLabel: string;
  mergeBelowLabel: string;
  splitTrackLabel: string;
  addCameraLabel: string;
  addCaptionLabel: string;
  addTextHorizontalLabel: string;
  addTextVerticalLabel: string;
  addShapeLabel: string;
  addImageLabel: string;
  addAudioLabel: string;
  settingsLabel: string;
  deleteLabel: string;
  captionSettingsLabel: string;
}

export function ObjectTimeline({
  durationMs,
  cameraEffects,
  cameraEffectLabel,
  cameraLabel,
  captions,
  captionTrackLabel,
  captionTrackEmptyLabel,
  captionInputLabel,
  captionDeleteLabel,
  formatCaptionDuration,
  audioLabel,
  audioTracks,
  audioTrackLabel,
  layers,
  playing,
  selectedLayerId,
  timeMs,
  labelFor,
  onChange,
  onAudioStartChange,
  onAddCamera,
  onAddCaption,
  onAddTextHorizontal,
  onAddTextVertical,
  onAddShape,
  onOpenAudioSettings,
  onOpenCameraSettings,
  onOpenCaptionSettings,
  onCaptionChange,
  onCaptionDelete,
  onCaptionTextChange,
  onOpenLayerSettings,
  onExtend,
  onDeleteKeyframe,
  onDeleteLayer,
  onDuplicateKeyframe,
  onKeyframeEasingChange,
  onMergeTrack,
  onMoveToTrack,
  onPlay,
  onReorder,
  onRename,
  onSelect,
  onSplitTrack,
  onSeek,
  onStop,
  collapseLabel,
  expandLabel,
  extendLabel,
  resizeLabel,
  playLabel,
  seekLabel,
  stopLabel,
  title,
  renameLabel,
  keyframeLabels,
  mergeAboveLabel,
  mergeBelowLabel,
  splitTrackLabel,
  addCameraLabel,
  addCaptionLabel,
  addTextHorizontalLabel,
  addTextVerticalLabel,
  addShapeLabel,
  addImageLabel,
  addAudioLabel,
  settingsLabel,
  deleteLabel,
  captionSettingsLabel,
}: ObjectTimelineProps) {
  const [expanded, setExpanded] = useState(true);
  const [height, setHeight] = useState(DEFAULT_TIMELINE_HEIGHT_PX);
  const [timelineMenu, setTimelineMenu] = useState<TimelineMenuState>();
  const scrollRef = useRef<HTMLDivElement>(null);
  const trackWidth = timelineTrackWidth(durationMs);
  const seconds = Array.from(
    { length: Math.floor(durationMs / 1000) + 1 },
    (_, index) => index,
  );

  function seekAt(clientX: number, element: HTMLDivElement) {
    const bounds = element.getBoundingClientRect();
    onSeek(
      Math.max(
        0,
        Math.min(
          durationMs,
          Math.round(((clientX - bounds.left) / bounds.width) * durationMs),
        ),
      ),
    );
  }

  function beginSeek(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    seekAt(event.clientX, event.currentTarget);
  }

  function dragSeek(event: PointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    seekAt(event.clientX, event.currentTarget);
  }

  function finishSeek(event: PointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    seekAt(event.clientX, event.currentTarget);
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  useEffect(() => {
    if (!playing || !expanded) return;
    const scroll = scrollRef.current;
    if (!scroll) return;
    const playheadContentX =
      TIMELINE_LABEL_WIDTH_PX + (timeMs / durationMs) * trackWidth;
    scroll.scrollLeft = followPlayheadScroll(
      scroll.scrollLeft,
      scroll.clientWidth,
      playheadContentX,
    );
  }, [durationMs, expanded, playing, timeMs, trackWidth]);

  return (
    <section
      className={
        expanded
          ? "object-timeline"
          : "object-timeline object-timeline--collapsed"
      }
      aria-label={title}
      style={expanded ? { height } : undefined}
    >
      <TimelineHeader
        collapseLabel={collapseLabel}
        expandLabel={expandLabel}
        expanded={expanded}
        extendLabel={extendLabel}
        height={height}
        maximumHeight={Math.max(
          MIN_TIMELINE_HEIGHT_PX,
          globalThis.innerHeight - TIMELINE_VIEWPORT_RESERVE_PX,
        )}
        minimumHeight={MIN_TIMELINE_HEIGHT_PX}
        onExtend={onExtend}
        onHeightChange={setHeight}
        onPlay={onPlay}
        onStop={onStop}
        onToggle={() => setExpanded((current) => !current)}
        playLabel={playLabel}
        playing={playing}
        resizeLabel={resizeLabel}
        stopLabel={stopLabel}
        timeMs={timeMs}
        title={title}
      />
      {expanded ? (
        <div className="object-timeline-scroll" ref={scrollRef}>
          <div
            className="object-timeline-grid"
            style={
              {
                minWidth: `${TIMELINE_LABEL_WIDTH_PX + trackWidth}px`,
                "--timeline-label-width": `${TIMELINE_LABEL_WIDTH_PX}px`,
                "--timeline-second-width": `${TIMELINE_SECOND_WIDTH_PX}px`,
                "--timeline-track-width": `${trackWidth}px`,
              } as CSSProperties
            }
            onContextMenu={(event) => {
              if (
                event.target instanceof Element &&
                event.target.closest(
                  ".object-timeline-clip, .camera-timeline-clip, .audio-timeline-clip, .caption-timeline-clip",
                )
              )
                return;
              event.preventDefault();
              setTimelineMenu({
                kind: "add",
                ...timelineMenuPosition(event.clientX, event.clientY, 8),
              });
            }}
          >
            <div className="object-timeline-corner" />
            <div
              aria-label={seekLabel}
              aria-valuemax={durationMs}
              aria-valuemin={0}
              aria-valuenow={Math.round(timeMs)}
              className="object-timeline-ruler"
              onKeyDown={(event) => {
                if (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
                  return;
                event.preventDefault();
                onSeek(
                  Math.max(
                    0,
                    Math.min(
                      durationMs - 1,
                      timeMs + (event.key === "ArrowRight" ? 50 : -50),
                    ),
                  ),
                );
              }}
              onPointerCancel={finishSeek}
              onPointerDown={beginSeek}
              onPointerMove={dragSeek}
              onPointerUp={finishSeek}
              role="slider"
              tabIndex={0}
            >
              {seconds.map((second) => (
                <span
                  key={second}
                  style={{ left: `${(second * 1000 * 100) / durationMs}%` }}
                >
                  {second}s
                </span>
              ))}
            </div>
            <CaptionTimelineTrack
              addLabel={addCaptionLabel}
              captions={captions}
              deleteLabel={captionDeleteLabel}
              durationMs={durationMs}
              emptyLabel={captionTrackEmptyLabel}
              formatDuration={formatCaptionDuration}
              inputLabel={captionInputLabel}
              label={captionTrackLabel}
              onAdd={onAddCaption}
              onChange={onCaptionChange}
              onDelete={onCaptionDelete}
              onOpenSettings={onOpenCaptionSettings}
              onSeek={onSeek}
              onTextChange={onCaptionTextChange}
              settingsLabel={captionSettingsLabel}
              timeMs={timeMs}
            />
            <CameraTimelineTrack
              durationMs={durationMs}
              effects={cameraEffects}
              label={cameraLabel}
              labelFor={cameraEffectLabel}
              onOpenMenu={(x, y) =>
                setTimelineMenu({
                  kind: "camera",
                  ...timelineMenuPosition(x, y, 1),
                })
              }
              onSeek={onSeek}
            />
            <AudioTimelineTracks
              durationMs={durationMs}
              label={audioLabel}
              labelFor={audioTrackLabel}
              onOpenMenu={(x, y) =>
                setTimelineMenu({
                  kind: "audio",
                  ...timelineMenuPosition(x, y, 1),
                })
              }
              onSeek={onSeek}
              onStartChange={onAudioStartChange}
              tracks={audioTracks}
            />
            <LayerTimelineTracks
              audioTrackCount={audioTracks.length}
              durationMs={durationMs}
              keyframeLabels={keyframeLabels}
              labelFor={labelFor}
              layers={layers}
              mergeAboveLabel={mergeAboveLabel}
              mergeBelowLabel={mergeBelowLabel}
              onChange={onChange}
              onDeleteKeyframe={onDeleteKeyframe}
              onDeleteLayer={onDeleteLayer}
              onDuplicateKeyframe={onDuplicateKeyframe}
              onKeyframeEasingChange={onKeyframeEasingChange}
              onMergeTrack={onMergeTrack}
              onMoveToTrack={onMoveToTrack}
              onOpenSettings={onOpenLayerSettings}
              onRename={onRename}
              onReorder={onReorder}
              onSeek={onSeek}
              onSelect={onSelect}
              onSplitTrack={onSplitTrack}
              renameLabel={renameLabel}
              selectedLayerId={selectedLayerId}
              settingsLabel={settingsLabel}
              deleteLabel={deleteLabel}
              splitTrackLabel={splitTrackLabel}
              timeMs={timeMs}
            />
            <div className="object-timeline-playhead-area">
              <div
                className="object-timeline-playhead"
                style={{ left: `${(timeMs * 100) / durationMs}%` }}
              />
            </div>
          </div>
        </div>
      ) : null}
      <TimelineContextMenu
        addAudioLabel={addAudioLabel}
        addCameraLabel={addCameraLabel}
        addCaptionLabel={addCaptionLabel}
        addImageLabel={addImageLabel}
        addShapeLabel={addShapeLabel}
        addTextHorizontalLabel={addTextHorizontalLabel}
        addTextVerticalLabel={addTextVerticalLabel}
        captionSettingsLabel={captionSettingsLabel}
        menu={timelineMenu}
        onAddAudio={onOpenAudioSettings}
        onAddCamera={onAddCamera}
        onAddCaption={() => onAddCaption(timeMs)}
        onAddImage={onOpenLayerSettings}
        onAddShape={onAddShape}
        onAddTextHorizontal={onAddTextHorizontal}
        onAddTextVertical={onAddTextVertical}
        onClose={() => setTimelineMenu(undefined)}
        onOpenAudioSettings={onOpenAudioSettings}
        onOpenCameraSettings={onOpenCameraSettings}
        onOpenCaptionSettings={onOpenCaptionSettings}
        settingsLabel={settingsLabel}
      />
    </section>
  );
}
