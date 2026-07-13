import { fireEvent, render } from "@testing-library/react";
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
    layers,
    playing: false,
    timeMs: 0,
    labelFor: (layer) => layer.id,
    onChange: noop,
    onAudioStartChange: noop,
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
    onCaptionTextChange: noop,
    onOpenLayerSettings: noop,
    onExtend: noop,
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
    expandLabel: "Expand",
    extendLabel: "Extend",
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
