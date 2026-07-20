import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProjectDetailDto } from "../../../shared/lib/api";
import { i18n } from "../../../i18n";
import { ProjectExportDialog } from "./ProjectExportDialog";

const detail = {
  project: {
    id: "project-1",
    name: "Example video",
    estimated_duration_ms: 10_000,
  },
  document: {
    video: { width: 1920, height: 1080, fps: 30, duration_ms: 10_000 },
  },
} as ProjectDetailDto;

describe("ProjectExportDialog", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("defaults to 10 FPS and allows a one-time override", () => {
    const onExport = vi.fn();
    render(
      <ProjectExportDialog
        busy={false}
        detail={detail}
        onClose={vi.fn()}
        onExport={onExport}
      />,
    );

    expect(screen.getByLabelText("FPS")).toHaveValue(10);
    expect(screen.getByText("Estimated frames: 100")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start export" }));

    expect(onExport).toHaveBeenCalledWith({
      filename: "Example video.mp4",
      width: 1920,
      height: 1080,
      fps: 10,
    });
  });
});
