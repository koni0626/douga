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
