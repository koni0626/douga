import { useTranslation } from "react-i18next";

import { assetContentUrl } from "../../../shared/lib/api";

export interface AssistantAttachmentItem {
  id: string;
  name: string;
}

interface AssistantAttachmentStripProps {
  attachments: AssistantAttachmentItem[];
  onRemove?: (assetId: string) => void;
}

export function AssistantAttachmentStrip({
  attachments,
  onRemove,
}: AssistantAttachmentStripProps) {
  const { t } = useTranslation();
  if (!attachments.length) return null;
  return (
    <div
      className="assistant-attachments"
      aria-label={t("assistant.attachments")}
    >
      {attachments.map((asset) => (
        <figure className="assistant-attachment" key={asset.id}>
          <img alt={asset.name} src={assetContentUrl(asset.id)} />
          {onRemove ? (
            <button
              type="button"
              aria-label={t("assistant.removeAttachment", {
                name: asset.name,
              })}
              onClick={() => onRemove(asset.id)}
            >
              ×
            </button>
          ) : null}
        </figure>
      ))}
    </div>
  );
}
