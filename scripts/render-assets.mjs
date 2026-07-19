export const renderAssetPathPrefix = "/__douga_render_assets__/";

export function buildRenderAssetUrls(imageFiles, origin) {
  return Object.fromEntries(
    Object.keys(imageFiles).map((assetId) => [
      assetId,
      new URL(`${renderAssetPathPrefix}${encodeURIComponent(assetId)}`, origin)
        .href,
    ]),
  );
}

export function resolveRenderAssetFile(imageFiles, requestUrl) {
  let url;
  try {
    url = new URL(requestUrl);
  } catch {
    return undefined;
  }
  if (!url.pathname.startsWith(renderAssetPathPrefix)) return undefined;
  const encodedAssetId = url.pathname.slice(renderAssetPathPrefix.length);
  let assetId;
  try {
    assetId = decodeURIComponent(encodedAssetId);
  } catch {
    return undefined;
  }
  if (!Object.hasOwn(imageFiles, assetId)) return undefined;
  const imageFile = imageFiles[assetId];
  if (!imageFile || typeof imageFile.path !== "string") return undefined;
  return imageFile;
}
