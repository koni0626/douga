import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { i18n } from "../../../i18n";
import type {
  AssistantToolCallDto,
  ImageArtifactDto,
  VideoArtifactDto,
} from "../../../shared/lib/api";
import { ApprovalCard } from "./ApprovalCard";
import { ImageArtifactCard } from "./ImageArtifactCard";
import { VideoArtifactCard } from "./VideoArtifactCard";

afterEach(cleanup);

describe("assistant tool cards", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("ja");
  });

  it("shows approval details and delegates the decision", () => {
    const onApprove = vi.fn();
    const onReject = vi.fn();
    const call: AssistantToolCallDto = {
      id: "call-1",
      run_id: "run-1",
      tool_name: "generate_image",
      arguments_json: { prompt: "夜の工場", quality: "high" },
      result_json: null,
      status: "waiting_approval",
      approval_required: true,
      approved_at: null,
      created_at: "2026-07-12T00:00:00Z",
      finished_at: null,
    };

    render(
      <ApprovalCard
        busy={false}
        call={call}
        onApprove={onApprove}
        onReject={onReject}
      />,
    );
    expect(screen.getByText("夜の工場")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "実行する" }));
    fireEvent.click(screen.getByRole("button", { name: "今回はしない" }));
    expect(onApprove).toHaveBeenCalledOnce();
    expect(onReject).toHaveBeenCalledOnce();
  });

  it("renders an owned generated image artifact", () => {
    const artifact: ImageArtifactDto = {
      artifact_type: "image",
      request_id: "request-1",
      asset_id: "asset-1",
      prompt: "青空",
      size: "1024x1024",
      quality: "medium",
    };
    render(<ImageArtifactCard artifact={artifact} />);
    expect(screen.getByRole("img", { name: "青空" })).toHaveAttribute(
      "src",
      expect.stringContaining("/assets/asset-1/content"),
    );
    expect(screen.getByText("生成した画像")).toBeInTheDocument();
  });

  it("renders a playable preview artifact", () => {
    const artifact: VideoArtifactDto = {
      artifact_type: "video_preview",
      export_id: "export-1",
      name: "preview.mp4",
      status: "succeeded",
      duration_ms: 5_000,
      range_start_ms: 0,
      range_end_ms: 5_000,
      error_code: null,
    };
    const { container } = render(<VideoArtifactCard artifact={artifact} />);
    expect(screen.getByText("確認用プレビュー")).toBeInTheDocument();
    expect(container.querySelector("video")).toHaveAttribute(
      "src",
      expect.stringContaining("/exports/export-1/content"),
    );
  });
});
