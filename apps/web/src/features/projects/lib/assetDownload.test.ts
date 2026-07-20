import { afterEach, describe, expect, it, vi } from "vitest";

import type { AssetDto } from "../../../shared/lib/api";

import {
  downloadImageAsset,
  imageAssetForDownload,
  imageAssetDownloadFilename,
} from "./assetDownload";

const asset: AssetDto = {
  id: "12345678-1234-1234-1234-123456789012",
  kind: "image",
  source: "generated",
  status: "ready",
  name: "X投稿用: 画像/案",
  original_filename: null,
  mime_type: "image/png",
  size_bytes: 100,
  width: 1024,
  height: 1024,
  duration_ms: null,
  tags: [],
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, "showSaveFilePicker");
});

describe("imageAssetDownloadFilename", () => {
  it("preserves an uploaded filename and adds an extension to generated images", () => {
    expect(
      imageAssetDownloadFilename({
        ...asset,
        original_filename: "uploaded.webp",
      }),
    ).toBe("uploaded.webp");
    expect(imageAssetDownloadFilename(asset)).toBe("X投稿用_ 画像_案.png");
  });
});

describe("imageAssetForDownload", () => {
  it("uses the visible layer name when an old asset is outside the loaded page", () => {
    expect(
      imageAssetForDownload(asset.id, "第2話 魂をバックアップする", []),
    ).toEqual(
      expect.objectContaining({
        id: asset.id,
        kind: "image",
        status: "ready",
        name: "第2話 魂をバックアップする",
      }),
    );
  });
});

describe("downloadImageAsset", () => {
  it("opens a save destination before writing the authenticated image", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Blob(["image"], { type: "image/png" }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const write = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const createWritable = vi.fn().mockResolvedValue({ write, close });
    const picker = vi.fn().mockResolvedValue({ createWritable });
    Object.defineProperty(window, "showSaveFilePicker", {
      configurable: true,
      value: picker,
    });

    await downloadImageAsset(asset);

    expect(picker).toHaveBeenCalledWith(
      expect.objectContaining({
        suggestedName: "X投稿用_ 画像_案.png",
        types: [
          {
            description: "Image",
            accept: { "image/png": [".png"] },
          },
        ],
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`/assets/${asset.id}/content`),
      { credentials: "include" },
    );
    expect(write).toHaveBeenCalledWith(expect.any(Blob));
    expect(close).toHaveBeenCalledOnce();
  });

  it("falls back to a browser download when the file picker is unavailable", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Blob(["image"], { type: "image/png" }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const createObjectUrl = vi.fn().mockReturnValue("blob:image");
    const revokeObjectUrl = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectUrl,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectUrl,
    });
    let downloadedFilename = "";
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloadedFilename = this.download;
    });

    await downloadImageAsset(asset);

    expect(downloadedFilename).toBe("X投稿用_ 画像_案.png");
    expect(createObjectUrl).toHaveBeenCalledOnce();
  });

  it("does not fetch the image when the save dialog is canceled", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(window, "showSaveFilePicker", {
      configurable: true,
      value: vi
        .fn()
        .mockRejectedValue(new DOMException("Canceled", "AbortError")),
    });

    await expect(downloadImageAsset(asset)).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
