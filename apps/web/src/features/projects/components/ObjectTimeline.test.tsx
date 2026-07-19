import { fireEvent, render, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ProjectDocument } from "@douga/project-schema";

import type { ObjectTimelineProps } from "./ObjectTimeline";
import { ObjectTimeline } from "./ObjectTimeline";

type Layer = ProjectDocument["scenes"][number]["layers"][number];

const layers: Layer[] = [
  {
    id: "source",
    type: "shape",
    shape: "rectangle",
    fill: "#fff",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    opacity: 1,
    start_ms: 0,
    end_ms: 2000,
  },
  {
    id: "target",
    type: "shape",
    shape: "rectangle",
    fill: "#000",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    opacity: 1,
    start_ms: 3000,
    end_ms: 5000,
  },
];

function props(
  overrides: Partial<ObjectTimelineProps> = {},
): ObjectTimelineProps {
  const noop = () => undefined;
  return {
    durationMs: 10_000,
    cameraEffects: [],
    cameraEffectLabel: () => "camera",
    cameraLabel: "Camera",
    captions: [],
    captionTrackLabel: "Captions",
    captionTrackEmptyLabel: "Empty",
    captionInputLabel: "Caption",
    captionDeleteLabel: "Delete",
    formatCaptionDuration: () => "0s",
    audioLabel: "Audio",
    audioTracks: [],
    audioTrackLabel: () => "audio",
    audioTrackSourceDuration: () => undefined,
    audioTrimEndLabel: "Trim end",
    audioTrimStartLabel: "Trim start",
    layers,
    playing: false,
    timeMs: 0,
    durationHandleLabel: "Change video end",
    durationInputLabel: "Video length",
    formatTimelineDuration: (duration) => `${duration}ms`,
    labelFor: (layer) => layer.id,
    onChange: noop,
    onAudioChange: noop,
    onAudioDelete: noop,
    onAddCamera: noop,
    onAddCaption: noop,
    onAddTextHorizontal: noop,
    onAddTextVertical: noop,
    onAddShape: noop,
    onOpenAudioSettings: noop,
    onOpenCameraSettings: noop,
    onOpenCaptionSettings: noop,
    onCaptionChange: noop,
    onCaptionDelete: noop,
    onCaptionSelect: noop,
    onCaptionTextChange: noop,
    onOpenLayerSettings: noop,
    onCut: noop,
    onDeleteRange: noop,
    onInsertRange: noop,
    onDurationChange: noop,
    onPlay: noop,
    onDeleteKeyframe: noop,
    onDeleteLayer: noop,
    onDuplicateKeyframe: noop,
    onKeyframeEasingChange: noop,
    onMergeTrack: noop,
    onMoveToTrack: noop,
    onReorder: noop,
    onRename: noop,
    onSelect: noop,
    onSplitTrack: noop,
    onSeek: noop,
    onStop: noop,
    collapseLabel: "Collapse",
    cutDisabled: false,
    cutLabel: "End at playhead",
    deleteRangeCancelLabel: "Cancel",
    deleteRangeConfirmLabel: (duration) =>
      `Selected: ${(duration / 1000).toFixed(2)}s`,
    deleteRangeInstruction: "Drag the ruler",
    deleteRangeLabel: "Delete range",
    insertRangeConfirmLabel: (atMs, durationMs) =>
      `Insert ${(durationMs / 1000).toFixed(2)}s at ${(atMs / 1000).toFixed(2)}s`,
    insertRangeDurationLabel: "Time to add",
    insertRangeInstruction: "Select insertion point",
    insertRangeLabel: "Insert time",
    expandLabel: "Expand",
    resizeLabel: "Resize",
    playLabel: "Play",
    seekLabel: "Timeline",
    stopLabel: "Stop",
    title: "Timeline",
    renameLabel: "Rename",
    keyframeLabels: {
      delete: "Delete",
      duplicate: "Duplicate",
      easing: "Easing",
      easingOptions: {
        linear: "Linear",
        ease_in: "Ease in",
        ease_out: "Ease out",
        ease_in_out: "Ease in out",
        bounce: "Bounce",
        step: "Step",
      },
      keyframe: "Keyframe",
    },
    mergeAboveLabel: "Merge above",
    mergeBelowLabel: "Merge below",
    splitTrackLabel: "Split",
    addCameraLabel: "Add camera",
    addCaptionLabel: "Add caption",
    addTextHorizontalLabel: "Add horizontal text",
    addTextVerticalLabel: "Add vertical text",
    addShapeLabel: "Add shape",
    addImageLabel: "Add image",
    addAudioLabel: "Add audio",
    settingsLabel: "Settings",
    deleteLabel: "Delete layer",
    captionSettingsLabel: "Caption settings",
    ...overrides,
  };
}

describe("ObjectTimeline", () => {
  it("renders an uploaded BGM as an audio timeline clip", () => {
    const view = render(
      <ObjectTimeline
        {...props({
          audioTrackLabel: () => "uploaded-bgm.mp3",
          audioTracks: [
            {
              id: "audio-1",
              asset_id: "asset-1",
              role: "bgm",
              start_ms: 1000,
              duration_ms: 3000,
              trim_start_ms: 0,
              volume: 0.7,
              loop: false,
              fade_in_ms: 0,
              fade_out_ms: 0,
              ducking: true,
            },
          ],
        })}
      />,
    );

    const clip = view.container.querySelector<HTMLElement>(
      ".audio-timeline-clip",
    );
    expect(clip).not.toBeNull();
    expect(clip).toHaveTextContent("uploaded-bgm.mp3");
    expect(clip).toHaveStyle({ left: "10%", width: "30%" });
    view.unmount();
  });

  it("trims an audio clip by dragging its right edge", () => {
    const onAudioChange = vi.fn();
    const view = render(
      <ObjectTimeline
        {...props({
          audioTrackSourceDuration: () => 10_000,
          audioTracks: [
            {
              id: "audio-1",
              asset_id: "asset-1",
              role: "bgm",
              start_ms: 1000,
              duration_ms: 3000,
              trim_start_ms: 0,
              volume: 0.7,
              loop: false,
              fade_in_ms: 0,
              fade_out_ms: 0,
              ducking: true,
            },
          ],
          onAudioChange,
        })}
      />,
    );
    const track = view.container.querySelector<HTMLElement>(
      ".audio-timeline-track",
    );
    expect(track).not.toBeNull();
    Object.defineProperty(track, "getBoundingClientRect", {
      value: () => ({ left: 0, right: 1000, width: 1000 }),
    });

    fireEvent.pointerDown(view.getByRole("separator", { name: "Trim end" }), {
      button: 0,
      clientX: 400,
    });
    fireEvent.pointerUp(window, { clientX: 500 });

    expect(onAudioChange).toHaveBeenCalledWith("audio-1", {
      start_ms: 1000,
      trim_start_ms: 0,
      duration_ms: 4000,
      fade_in_ms: 0,
      fade_out_ms: 0,
    });
    view.unmount();
  });

  it("deletes the focused audio clip with the Delete key", () => {
    const onAudioDelete = vi.fn();
    const view = render(
      <ObjectTimeline
        {...props({
          audioTrackLabel: () => "voice.wav",
          audioTracks: [
            {
              id: "audio-1",
              asset_id: "asset-1",
              role: "narration",
              start_ms: 0,
              duration_ms: 1000,
              trim_start_ms: 0,
              volume: 1,
              loop: false,
              fade_in_ms: 0,
              fade_out_ms: 0,
              ducking: false,
            },
          ],
          onAudioDelete,
        })}
      />,
    );
    const clip = view.getByLabelText("voice.wav");

    clip.focus();
    fireEvent.keyDown(clip, { key: "Delete" });

    expect(onAudioDelete).toHaveBeenCalledOnce();
    expect(onAudioDelete).toHaveBeenCalledWith("audio-1");
    view.unmount();
  });

  it("opens settings for the right-clicked audio clip", () => {
    const onOpenAudioSettings = vi.fn();
    const view = render(
      <ObjectTimeline
        {...props({
          audioTrackLabel: () => "voice.wav",
          audioTracks: [
            {
              id: "audio-1",
              asset_id: "asset-1",
              role: "narration",
              start_ms: 0,
              duration_ms: 1000,
              trim_start_ms: 0,
              volume: 1,
              loop: false,
              fade_in_ms: 0,
              fade_out_ms: 0,
              ducking: false,
            },
          ],
          onOpenAudioSettings,
        })}
      />,
    );

    fireEvent.contextMenu(view.getByLabelText("voice.wav"), {
      clientX: 100,
      clientY: 100,
    });
    fireEvent.click(view.getByRole("menuitem", { name: "Settings" }));

    expect(onOpenAudioSettings).toHaveBeenCalledOnce();
    expect(onOpenAudioSettings).toHaveBeenCalledWith("audio-1");
    view.unmount();
  });

  it("cuts the timeline at the selected playhead position", () => {
    const onCut = vi.fn();
    const view = render(<ObjectTimeline {...props({ onCut })} />);

    fireEvent.click(view.getByRole("button", { name: "End at playhead" }));

    expect(onCut).toHaveBeenCalledOnce();
    view.unmount();
  });

  it("changes the duration by dragging the timeline end handle", () => {
    const onDurationChange = vi.fn();
    const view = render(<ObjectTimeline {...props({ onDurationChange })} />);

    fireEvent.pointerDown(
      view.getByRole("separator", { name: "Change video end" }),
      { button: 0, clientX: 480 },
    );
    fireEvent.pointerMove(window, { clientX: 576 });
    expect(view.getByText("12000ms")).toBeInTheDocument();
    fireEvent.pointerUp(window, { clientX: 576 });

    expect(onDurationChange).toHaveBeenCalledWith(12_000);
    view.unmount();
  });

  it("changes the duration by entering seconds", () => {
    const onDurationChange = vi.fn();
    const view = render(<ObjectTimeline {...props({ onDurationChange })} />);
    const input = view.getByRole("spinbutton", { name: "Video length" });

    fireEvent.change(input, { target: { value: "12.35" } });
    fireEvent.blur(input);

    expect(onDurationChange).toHaveBeenCalledWith(12_000);
    view.unmount();
  });

  it("seeks continuously while dragging the ruler", () => {
    const onSeek = vi.fn();
    const view = render(<ObjectTimeline {...props({ onSeek })} />);
    const ruler = view.getByRole("slider", { name: "Timeline" });
    Object.defineProperty(ruler, "getBoundingClientRect", {
      value: () => ({ left: 0, right: 500, width: 500 }),
    });
    Object.defineProperties(ruler, {
      setPointerCapture: { value: vi.fn() },
      hasPointerCapture: { value: vi.fn(() => true) },
      releasePointerCapture: { value: vi.fn() },
    });

    fireEvent.pointerDown(ruler, { button: 0, clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(ruler, { clientX: 250, pointerId: 1 });
    fireEvent.pointerUp(ruler, { clientX: 300, pointerId: 1 });

    expect(onSeek).toHaveBeenLastCalledWith(6000);
    expect(onSeek).toHaveBeenCalledTimes(3);
  });

  it("selects a ruler range and requests that interval be deleted", () => {
    const onDeleteRange = vi.fn();
    const view = render(<ObjectTimeline {...props({ onDeleteRange })} />);
    const timeline = within(view.container);
    fireEvent.click(timeline.getByRole("button", { name: "Delete range" }));
    const ruler = timeline.getByRole("slider", { name: "Timeline" });
    Object.defineProperty(ruler, "getBoundingClientRect", {
      value: () => ({ left: 0, right: 500, width: 500 }),
    });
    Object.defineProperties(ruler, {
      setPointerCapture: { value: vi.fn() },
      hasPointerCapture: { value: vi.fn(() => true) },
      releasePointerCapture: { value: vi.fn() },
    });

    fireEvent.pointerDown(ruler, { button: 0, clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(ruler, { clientX: 300, pointerId: 1 });
    fireEvent.pointerUp(ruler, { clientX: 300, pointerId: 1 });

    expect(timeline.getByText("Selected: 4.00s")).toBeInTheDocument();
    expect(
      view.container.querySelector(".object-timeline-delete-selection"),
    ).toHaveStyle({ left: "20%", width: "40%" });
    fireEvent.click(timeline.getByRole("button", { name: "Delete range" }));

    expect(onDeleteRange).toHaveBeenCalledWith(2000, 6000);
  });

  it("selects an insertion point and requests time to be inserted", () => {
    const onInsertRange = vi.fn();
    const view = render(<ObjectTimeline {...props({ onInsertRange })} />);
    const timeline = within(view.container);
    fireEvent.click(timeline.getByRole("button", { name: "Insert time" }));
    const ruler = timeline.getByRole("slider", { name: "Timeline" });
    Object.defineProperty(ruler, "getBoundingClientRect", {
      value: () => ({ left: 0, right: 500, width: 500 }),
    });
    Object.defineProperties(ruler, {
      setPointerCapture: { value: vi.fn() },
      hasPointerCapture: { value: vi.fn(() => true) },
      releasePointerCapture: { value: vi.fn() },
    });

    fireEvent.pointerDown(ruler, { button: 0, clientX: 300, pointerId: 1 });
    fireEvent.pointerUp(ruler, { clientX: 300, pointerId: 1 });
    fireEvent.change(
      timeline.getByRole("spinbutton", { name: "Time to add" }),
      {
        target: { value: "2.5" },
      },
    );

    expect(timeline.getByText("Insert 2.50s at 6.00s")).toBeInTheDocument();
    expect(
      view.container.querySelector(".object-timeline-insert-position"),
    ).toHaveStyle({ left: "60%" });
    fireEvent.click(timeline.getByRole("button", { name: "Insert time" }));

    expect(onInsertRange).toHaveBeenCalledWith(6000, 2500);
  });

  it("scrolls the time area to keep playback visible", () => {
    const view = render(<ObjectTimeline {...props({ durationMs: 30_000 })} />);
    const scroll = view.container.querySelector<HTMLElement>(
      ".object-timeline-scroll",
    );
    expect(scroll).not.toBeNull();
    Object.defineProperty(scroll, "clientWidth", { value: 600 });

    view.rerender(
      <ObjectTimeline
        {...props({ durationMs: 30_000, playing: true, timeMs: 20_000 })}
      />,
    );

    expect(scroll?.scrollLeft).toBeGreaterThan(0);
  });

  it("moves a dragged clip onto another layer track", () => {
    const onMoveToTrack = vi.fn();
    const onChange = vi.fn();
    const view = render(
      <ObjectTimeline {...props({ onChange, onMoveToTrack })} />,
    );
    const clips = Array.from(
      view.container.querySelectorAll<HTMLElement>(".object-timeline-clip"),
    );
    const sourceClip = clips.find((clip) => clip.textContent === "source");
    const sourceTrack = sourceClip?.parentElement;
    const targetTrack = view.container.querySelector<HTMLElement>(
      '[data-timeline-track-target="target"]',
    );
    expect(sourceClip).toBeDefined();
    expect(sourceTrack).not.toBeNull();
    expect(targetTrack).not.toBeNull();
    Object.defineProperty(sourceClip, "getBoundingClientRect", {
      value: () => ({ left: 0, right: 200, width: 200 }),
    });
    Object.defineProperty(sourceTrack, "getBoundingClientRect", {
      value: () => ({ left: 0, right: 1000, width: 1000 }),
    });
    Object.defineProperty(document, "elementsFromPoint", {
      configurable: true,
      value: vi.fn(() => [targetTrack]),
    });

    fireEvent.pointerDown(sourceClip!, { button: 0, clientX: 100 });
    fireEvent.pointerMove(window, { clientX: 200, clientY: 50 });
    fireEvent.pointerUp(window, { clientX: 200, clientY: 50 });

    expect(onMoveToTrack).toHaveBeenCalledWith("source", "target", {
      startMs: 1000,
      endMs: 3000,
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("reorders shape layers by dragging a layer label", () => {
    const onReorder = vi.fn();
    const view = render(<ObjectTimeline {...props({ onReorder })} />);
    const labels = Array.from(
      view.container.querySelectorAll<HTMLElement>(".object-timeline-label"),
    );
    const sourceLabel = labels.find((label) => label.textContent === "source");
    const targetLabel = labels.find((label) => label.textContent === "target");
    expect(sourceLabel).toBeDefined();
    expect(targetLabel).toBeDefined();
    Object.defineProperty(targetLabel, "getBoundingClientRect", {
      value: () => ({ top: 40, bottom: 70, height: 30 }),
    });
    Object.defineProperty(document, "elementsFromPoint", {
      configurable: true,
      value: vi.fn(() => [targetLabel]),
    });

    fireEvent.pointerDown(sourceLabel!, {
      button: 0,
      clientX: 20,
      clientY: 20,
    });
    fireEvent.pointerMove(window, { clientX: 20, clientY: 50 });
    fireEvent.pointerUp(window, { clientX: 20, clientY: 50 });

    expect(onReorder).toHaveBeenCalledWith(0, 1, "after");
  });

  it("seeks to the clicked position without moving the clip", () => {
    const onChange = vi.fn();
    const onSeek = vi.fn();
    const view = render(<ObjectTimeline {...props({ onChange, onSeek })} />);
    const sourceClip = Array.from(
      view.container.querySelectorAll<HTMLElement>(".object-timeline-clip"),
    ).find((clip) => clip.textContent === "source");
    const sourceTrack = sourceClip?.parentElement;
    expect(sourceClip).toBeDefined();
    expect(sourceTrack).not.toBeNull();
    Object.defineProperty(sourceClip, "getBoundingClientRect", {
      value: () => ({ left: 0, right: 200, width: 200 }),
    });
    Object.defineProperty(sourceTrack, "getBoundingClientRect", {
      value: () => ({ left: 0, right: 1000, width: 1000 }),
    });

    fireEvent.pointerDown(sourceClip!, {
      button: 0,
      clientX: 100,
      clientY: 50,
    });
    fireEvent.pointerUp(window, { clientX: 100, clientY: 50 });

    expect(onSeek).toHaveBeenCalledWith(1000);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("closes the add menu when clicking outside", () => {
    const view = render(<ObjectTimeline {...props()} />);
    const grid = view.container.querySelector<HTMLElement>(
      ".object-timeline-grid",
    );
    expect(grid).not.toBeNull();

    fireEvent.contextMenu(grid!, { clientX: 100, clientY: 100 });
    expect(view.getByRole("menu")).toBeInTheDocument();

    fireEvent.pointerDown(document.body);

    expect(view.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("offers separate horizontal and vertical text box actions", () => {
    const onAddTextHorizontal = vi.fn();
    const onAddTextVertical = vi.fn();
    const view = render(
      <ObjectTimeline {...props({ onAddTextHorizontal, onAddTextVertical })} />,
    );
    const grid = view.container.querySelector<HTMLElement>(
      ".object-timeline-grid",
    );
    expect(grid).not.toBeNull();

    fireEvent.contextMenu(grid!, { clientX: 100, clientY: 100 });
    fireEvent.click(view.getByRole("menuitem", { name: "Add vertical text" }));

    expect(onAddTextVertical).toHaveBeenCalledOnce();
    expect(onAddTextHorizontal).not.toHaveBeenCalled();
  });

  it("deletes the layer selected from its context menu", () => {
    const onDeleteLayer = vi.fn();
    const view = render(<ObjectTimeline {...props({ onDeleteLayer })} />);
    const sourceClip = Array.from(
      view.container.querySelectorAll<HTMLElement>(".object-timeline-clip"),
    ).find((clip) => clip.textContent === "source");
    expect(sourceClip).toBeDefined();

    fireEvent.contextMenu(sourceClip!, { clientX: 100, clientY: 100 });
    fireEvent.click(view.getByRole("menuitem", { name: "Delete layer" }));

    expect(onDeleteLayer).toHaveBeenCalledWith("source");
    expect(view.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes a layer context menu when clicking outside", () => {
    const view = render(<ObjectTimeline {...props()} />);
    const outside = document.createElement("button");
    outside.addEventListener("pointerdown", (event) => event.stopPropagation());
    document.body.append(outside);
    const sourceClip = Array.from(
      view.container.querySelectorAll<HTMLElement>(".object-timeline-clip"),
    ).find((clip) => clip.textContent === "source");
    expect(sourceClip).toBeDefined();

    fireEvent.contextMenu(sourceClip!, { clientX: 100, clientY: 100 });
    expect(view.getByRole("menu")).toBeInTheDocument();

    fireEvent.pointerDown(outside);

    expect(view.queryByRole("menu")).not.toBeInTheDocument();
    outside.remove();
  });
});
