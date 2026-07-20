import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { i18n } from "../../../i18n";
import type { CreativeDocumentDto } from "../../../shared/lib/api";
import { CreativeDocumentCard } from "./CreativeDocumentCard";
import { creativeDocument } from "./creativeDocument";

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

  it("shows the latest structured document without an adoption choice", () => {
    render(<CreativeDocumentCard document={document} />);

    expect(screen.getByText("プロット")).toBeInTheDocument();
    expect(screen.getByText("Factory revival")).toBeInTheDocument();
    expect(screen.getByText(/v2/)).toHaveTextContent("最新版");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("does not treat an audio artifact as a creative document", () => {
    expect(
      creativeDocument({
        artifact_type: "audio",
        asset_id: "audio-1",
        title: "Narration",
      }),
    ).toBeUndefined();
  });

  it("renders a fallback instead of crashing when legacy content is missing", () => {
    const legacyDocument = {
      ...document,
      content: undefined,
    } as unknown as CreativeDocumentDto;

    render(<CreativeDocumentCard document={legacyDocument} />);

    expect(screen.getByRole("article")).toBeInTheDocument();
  });
});
