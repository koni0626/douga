import { describe, expect, it } from "vitest";

import type { ProjectDocument } from "@douga/project-schema";

import { projectRenderAssetIds } from "./WebGlProjectRenderer";

describe("projectRenderAssetIds", () => {
  it("returns unique sorted background and image asset identifiers", () => {
    const project = {
      scenes: [
        {
          background: { type: "asset", asset_id: "background-2" },
          layers: [
            { type: "image", asset_id: "image-2" },
            { type: "image", asset_id: "image-1" },
            { type: "image", asset_id: "image-2" },
            { type: "shape" },
          ],
        },
        {
          background: { type: "asset", asset_id: "background-1" },
          layers: [],
        },
      ],
    } as unknown as ProjectDocument;

    expect(projectRenderAssetIds(project)).toEqual([
      "background-1",
      "background-2",
      "image-1",
      "image-2",
    ]);
  });
});
