import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRenderAssetUrls,
  renderAssetPathPrefix,
  resolveRenderAssetFile,
} from "./render-assets.mjs";

test("buildRenderAssetUrls exposes opaque renderer URLs instead of local paths", () => {
  const imageFiles = {
    "asset-1": { path: "C:\\private\\one.png", mime_type: "image/png" },
  };

  const urls = buildRenderAssetUrls(imageFiles, "http://127.0.0.1:4174");

  assert.equal(
    urls["asset-1"],
    `http://127.0.0.1:4174${renderAssetPathPrefix}asset-1`,
  );
  assert.equal(urls["asset-1"].includes("private"), false);
});

test("resolveRenderAssetFile only resolves a registered asset", () => {
  const image = { path: "C:\\private\\one.png", mime_type: "image/png" };
  const imageFiles = { "asset-1": image };

  assert.equal(
    resolveRenderAssetFile(
      imageFiles,
      `http://127.0.0.1:4174${renderAssetPathPrefix}asset-1`,
    ),
    image,
  );
  assert.equal(
    resolveRenderAssetFile(
      imageFiles,
      `http://127.0.0.1:4174${renderAssetPathPrefix}unknown`,
    ),
    undefined,
  );
  assert.equal(
    resolveRenderAssetFile(imageFiles, "http://127.0.0.1:4174/index.html"),
    undefined,
  );
});
