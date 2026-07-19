import { useTranslation } from "react-i18next";

import type { CreativeDocumentDto } from "../../../shared/lib/api";

interface CreativeDocumentCardProps {
  document: CreativeDocumentDto;
  onAdopt: (document: CreativeDocumentDto) => void;
  adopting: boolean;
}

function textValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function itemCount(
  document: CreativeDocumentDto,
  content: Record<string, unknown>,
): number | undefined {
  const key =
    document.kind === "script"
      ? "blocks"
      : document.kind === "storyboard"
        ? "shots"
        : "sections";
  const value = content[key];
  return Array.isArray(value) ? value.length : undefined;
}

export function CreativeDocumentCard({
  document,
  onAdopt,
  adopting,
}: CreativeDocumentCardProps) {
  const { t } = useTranslation();
  const content = recordValue(document.content);
  const title =
    textValue(content.title) ??
    textValue(content.purpose) ??
    t(`assistant.artifacts.${document.kind}`);
  const summary = textValue(content.logline) ?? textValue(content.core_message);
  const count = itemCount(document, content);

  return (
    <article className="assistant-artifact-card">
      <header>
        <span>{t(`assistant.artifacts.${document.kind}`)}</span>
        <small>
          v{document.version} ·{" "}
          {t(`assistant.artifacts.status.${document.status}`)}
        </small>
      </header>
      <strong>{title}</strong>
      {summary ? <p>{summary}</p> : null}
      {count !== undefined ? (
        <small>{t("assistant.artifacts.itemCount", { count })}</small>
      ) : null}
      {document.status !== "approved" ? (
        <button
          type="button"
          disabled={adopting}
          onClick={() => onAdopt(document)}
        >
          {adopting
            ? t("assistant.artifacts.adopting")
            : t("assistant.artifacts.adopt")}
        </button>
      ) : (
        <span className="assistant-artifact-approved">
          {t("assistant.artifacts.approvedMark")}
        </span>
      )}
    </article>
  );
}
