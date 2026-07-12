import { useTranslation } from "react-i18next";

import {
  exportContentUrl,
  type VideoArtifactDto,
} from "../../../shared/lib/api";

export function VideoArtifactCard({
  artifact,
}: {
  artifact: VideoArtifactDto;
}) {
  const { t } = useTranslation();
  const ready = artifact.status === "succeeded";
  return (
    <article className="assistant-video-card">
      <strong>
        {t(
          artifact.artifact_type === "video_preview"
            ? "assistant.video.preview"
            : "assistant.video.export",
        )}
      </strong>
      {ready ? (
        <video
          controls
          preload="metadata"
          src={exportContentUrl(artifact.export_id)}
        />
      ) : (
        <p>{t(`jobs.${artifact.status}`)}</p>
      )}
      <span>{artifact.name}</span>
      {ready ? (
        <a href={exportContentUrl(artifact.export_id)}>
          {t("assistant.video.open")}
        </a>
      ) : null}
    </article>
  );
}
