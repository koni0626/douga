import { type ClipboardEvent, useState } from "react";

import { uploadAsset } from "../../assets/lib/uploadAsset";
import { ApiError, type AssetDto } from "../../../shared/lib/api";

export const MAX_ASSISTANT_IMAGE_ATTACHMENTS = 4;

export function imageFilesFromClipboard(items: DataTransferItemList): File[] {
  return Array.from(items).flatMap((item) => {
    if (item.kind !== "file" || !item.type.startsWith("image/")) return [];
    const file = item.getAsFile();
    if (!file) return [];
    if (file.name && file.name !== "image") return [file];
    const extension =
      file.type === "image/jpeg"
        ? "jpg"
        : file.type === "image/webp"
          ? "webp"
          : "png";
    return [
      new File([file], `clipboard-${Date.now()}.${extension}`, {
        type: file.type || "image/png",
      }),
    ];
  });
}

export function useAssistantImageAttachments() {
  const [attachments, setAttachments] = useState<AssetDto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [errorKey, setErrorKey] = useState<string>();

  async function paste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const files = imageFilesFromClipboard(event.clipboardData.items);
    if (!files.length) return;
    event.preventDefault();
    if (uploading) return;
    if (attachments.length + files.length > MAX_ASSISTANT_IMAGE_ATTACHMENTS) {
      setErrorKey("errors.assistantAttachmentLimit");
      return;
    }
    setUploading(true);
    setErrorKey(undefined);
    try {
      const uploaded: AssetDto[] = [];
      for (const file of files) uploaded.push(await uploadAsset(file, "image"));
      setAttachments((current) => [...current, ...uploaded]);
    } catch (error) {
      setErrorKey(
        error instanceof ApiError ? error.messageKey : "errors.unknown",
      );
    } finally {
      setUploading(false);
    }
  }

  return {
    attachments,
    clear: () => setAttachments([]),
    clearError: () => setErrorKey(undefined),
    errorKey,
    paste,
    remove: (assetId: string) =>
      setAttachments((current) =>
        current.filter((asset) => asset.id !== assetId),
      ),
    replace: setAttachments,
    uploading,
  };
}
