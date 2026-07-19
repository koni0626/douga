import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { i18n } from "../../../i18n";
import { ExportListPage } from "./ExportListPage";

describe("ExportListPage", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a user-facing error for a failed export", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            {
              id: "export-1",
              project_id: "project-1",
              project_revision_id: "revision-1",
              job_id: "job-1",
              name: "Portrait.mp4",
              kind: "export",
              range_start_ms: null,
              range_end_ms: null,
              status: "failed",
              progress: 35,
              width: 1080,
              height: 1920,
              fps: 10,
              size_bytes: null,
              duration_ms: null,
              error_code: "EXPORT_FAILED",
              created_at: "2026-07-18T00:00:00Z",
            },
          ],
          total: 1,
        }),
      })),
    );

    render(<ExportListPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Video export failed.",
    );
    expect(screen.getByText("Failed (35%)")).toBeInTheDocument();
  });
});
