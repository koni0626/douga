import { useTranslation } from "react-i18next";

import type { AssistantToolCallDto } from "../../../shared/lib/api";

interface ApprovalCardProps {
  busy: boolean;
  call: AssistantToolCallDto;
  onApprove: () => void;
  onReject: () => void;
}

export function ApprovalCard({
  busy,
  call,
  onApprove,
  onReject,
}: ApprovalCardProps) {
  const { t } = useTranslation();
  const prompt =
    typeof call.arguments_json.prompt === "string"
      ? call.arguments_json.prompt
      : undefined;
  const quality =
    typeof call.arguments_json.quality === "string"
      ? call.arguments_json.quality
      : undefined;

  return (
    <article className="assistant-approval-card">
      <span>{t("assistant.approval.required")}</span>
      <strong>{t(`assistant.tools.${call.tool_name}`)}</strong>
      {prompt ? <p>{prompt}</p> : null}
      {quality ? (
        <small>{t("assistant.approval.quality", { quality })}</small>
      ) : null}
      <div>
        <button type="button" disabled={busy} onClick={onApprove}>
          {t("assistant.approval.approve")}
        </button>
        <button type="button" disabled={busy} onClick={onReject}>
          {t("assistant.approval.reject")}
        </button>
      </div>
    </article>
  );
}
