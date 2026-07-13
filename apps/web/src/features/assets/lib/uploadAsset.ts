import {
  apiRequest,
  apiUpload,
  type AssetDto,
  type UploadTargetDto,
} from "../../../shared/lib/api";

export async function uploadAsset(
  file: File,
  kind: AssetDto["kind"],
): Promise<AssetDto> {
  const target = await apiRequest<UploadTargetDto>("/assets/uploads", {
    method: "POST",
    body: JSON.stringify({
      name: file.name,
      original_filename: file.name,
      kind,
      content_type: file.type || undefined,
      size_bytes: file.size,
    }),
  });
  await apiUpload(target.upload_path, file);
  return apiRequest<AssetDto>(`/assets/${target.asset.id}/complete`, {
    method: "POST",
  });
}
