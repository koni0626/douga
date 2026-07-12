import { useTranslation } from "react-i18next";

import {
  assetContentUrl,
  type ImageArtifactDto,
} from "../../../shared/lib/api";

export function ImageArtifactCard({
  artifact,
}: {
  artifact: ImageArtifactDto;
}) {
  const { t } = useTranslation();
  return (
    <article className="assistant-image-card">
      <img alt={artifact.prompt} src={assetContentUrl(artifact.asset_id)} />
      <div>
        <strong>{t("assistant.image.generated")}</strong>
        <p>{artifact.prompt}</p>
        <small>
          {artifact.size} · {artifact.quality}
        </small>
      </div>
    </article>
  );
}
