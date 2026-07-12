import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { i18n } from "../../../i18n";
import type { CreativeDocumentDto } from "../../../shared/lib/api";
import { CreativeDocumentCard } from "./CreativeDocumentCard";

const document: CreativeDocumentDto = {
  id: "document-1",
  project_id: "project-1",
  kind: "plot",
  status: "proposed",
  version: 2,
  content: {
    title: "Factory revival",
    logline: "A small factory changes with AI.",
    sections: [{ id: "opening" }],
  },
  source_run_id: "run-1",
  created_at: "2026-07-12T00:00:00Z",
  updated_at: "2026-07-12T00:00:00Z",
};

afterEach(cleanup);

describe("CreativeDocumentCard", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("ja");
  });

  it("shows a structured proposal and lets the user adopt it", () => {
    const onAdopt = vi.fn();
    render(
      <CreativeDocumentCard
        adopting={false}
        document={document}
        onAdopt={onAdopt}
      />,
    );

    expect(screen.getByText("プロット")).toBeInTheDocument();
    expect(screen.getByText("Factory revival")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "この案を採用" }));
    expect(onAdopt).toHaveBeenCalledWith(document);
  });
});
