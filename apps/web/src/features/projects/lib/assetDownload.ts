import { assetContentUrl, type AssetDto } from "../../../shared/lib/api";

const IMAGE_EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  "image/avif": ".avif",
  "image/gif": ".gif",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

interface ImageSaveFilePickerOptions {
  suggestedName: string;
  types: Array<{
    description: string;
    accept: Record<string, string[]>;
  }>;
}

interface ImageFileHandle {
  createWritable: () => Promise<{
    write: (data: Blob) => Promise<void>;
    close: () => Promise<void>;
  }>;
}

type ImageSaveFilePicker = (
  options: ImageSaveFilePickerOptions,
) => Promise<ImageFileHandle>;

export function imageAssetForDownload(
  assetId: string,
  layerName: string | undefined,
  assets: AssetDto[],
): AssetDto {
  return (
    assets.find((asset) => asset.id === assetId) ?? {
      id: assetId,
      kind: "image",
      source: "generated",
      status: "ready",
      name: layerName?.trim() || `image-${assetId.slice(0, 8)}`,
      original_filename: null,
      mime_type: null,
      size_bytes: null,
      width: null,
      height: null,
      duration_ms: null,
      tags: [],
    }
  );
}

export function imageAssetDownloadFilename(asset: AssetDto): string {
  const fallback = `image-${asset.id.slice(0, 8)}`;
  const candidate = Array.from(
    asset.original_filename ?? asset.name ?? fallback,
    (character) => (character.charCodeAt(0) < 32 ? "_" : character),
  )
    .join("")
    .replace(/[<>:"/\\|?*]/gu, "_")
    .trim()
    .slice(0, 160);
  const filename = candidate || fallback;
  if (/\.[a-z0-9]{2,5}$/iu.test(filename)) return filename;
  return `${filename}${IMAGE_EXTENSION_BY_MIME_TYPE[asset.mime_type ?? ""] ?? ".png"}`;
}

export async function downloadImageAsset(asset: AssetDto): Promise<void> {
  if (asset.kind !== "image" || asset.status !== "ready") {
    throw new Error("Image asset is not ready for download");
  }
  const filename = imageAssetDownloadFilename(asset);
  const mimeType = asset.mime_type?.startsWith("image/")
    ? asset.mime_type
    : undefined;
  const extension =
    filename.match(/\.[a-z0-9]{2,5}$/iu)?.[0].toLowerCase() ??
    (mimeType ? IMAGE_EXTENSION_BY_MIME_TYPE[mimeType] : undefined) ??
    ".png";
  const picker = (
    window as Window & { showSaveFilePicker?: ImageSaveFilePicker }
  ).showSaveFilePicker;
  let handle: ImageFileHandle | undefined;
  if (picker) {
    try {
      handle = await picker.call(window, {
        suggestedName: filename,
        types: mimeType
          ? [
              {
                description: "Image",
                accept: { [mimeType]: [extension] },
              },
            ]
          : [],
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      throw error;
    }
  }

  const response = await fetch(assetContentUrl(asset.id), {
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(`Image download failed (${response.status})`);
  }
  const blob = await response.blob();
  if (handle) {
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return;
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
