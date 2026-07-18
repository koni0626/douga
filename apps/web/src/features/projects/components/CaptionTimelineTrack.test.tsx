import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { CaptionTimelineTrack } from "./CaptionTimelineTrack";

it("shows caption text and its duration on the pinned track", () => {
  const onAdd = vi.fn();
  const onTextChange = vi.fn();
  render(
    <CaptionTimelineTrack
      addLabel="Add caption"
      captions={[
        { id: "caption-1", text: "Opening", startMs: 1000, endMs: 4500 },
      ]}
      deleteLabel="Delete caption"
      durationMs={10_000}
      emptyLabel="Double-click to add"
      formatDuration={(durationMs) => `${(durationMs / 1000).toFixed(1)}s`}
      inputLabel="Caption text"
      label="Captions"
      onAdd={onAdd}
      onChange={vi.fn()}
      onDelete={vi.fn()}
      onOpenSettings={vi.fn()}
      onSelect={vi.fn()}
      onSeek={vi.fn()}
      onTextChange={onTextChange}
      settingsLabel="Settings"
      timeMs={2000}
    />,
  );

  expect(screen.getByText("3.5s")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Add caption" }));
  expect(onAdd).toHaveBeenCalledWith(2000);

  fireEvent.change(screen.getByRole("textbox", { name: "Caption text" }), {
    target: { value: "Updated opening" },
  });
  expect(onTextChange).toHaveBeenCalledWith("caption-1", "Updated opening");
});

it("deletes a focused caption clip but preserves Delete inside its text input", () => {
  const onDelete = vi.fn();
  const onSelect = vi.fn();
  const view = render(
    <CaptionTimelineTrack
      addLabel="Add caption"
      captions={[{ id: "caption-1", text: "Opening", startMs: 0, endMs: 2000 }]}
      deleteLabel="Delete caption"
      durationMs={5000}
      emptyLabel="Double-click to add"
      formatDuration={(durationMs) => `${durationMs}ms`}
      inputLabel="Caption text"
      label="Captions"
      onAdd={vi.fn()}
      onChange={vi.fn()}
      onDelete={onDelete}
      onOpenSettings={vi.fn()}
      onSelect={onSelect}
      onSeek={vi.fn()}
      onTextChange={vi.fn()}
      settingsLabel="Settings"
      timeMs={0}
    />,
  );

  const input = view.container.querySelector<HTMLInputElement>(
    'input[aria-label="Caption text"]',
  );
  if (!input) throw new Error("Caption input missing");
  const clip = input.closest(".caption-timeline-clip");
  if (!(clip instanceof HTMLElement)) throw new Error("Caption clip missing");

  fireEvent.pointerDown(clip, { button: 0, clientX: 10 });
  expect(onSelect).toHaveBeenCalledWith("caption-1");
  expect(clip).toHaveFocus();
  fireEvent.keyDown(clip, { key: "Delete" });
  expect(onDelete).toHaveBeenCalledWith("caption-1");

  fireEvent.keyDown(input, { key: "Delete" });
  expect(onDelete).toHaveBeenCalledTimes(1);
});
