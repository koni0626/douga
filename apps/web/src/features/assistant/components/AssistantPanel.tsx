import { type FormEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  ApiError,
  apiRequest,
  type AssistantMessageDto,
  type AssistantThreadDetailDto,
  type AssistantThreadDto,
  type AssistantThreadListDto,
  type AssistantTurnDto,
} from "../../../shared/lib/api";

interface AssistantPanelProps {
  onCollapse: () => void;
  onWidthChange: (width: number) => void;
  projectId: string;
  width: number;
}

export function AssistantPanel({
  onCollapse,
  onWidthChange,
  projectId,
  width,
}: AssistantPanelProps) {
  const { t } = useTranslation();
  const [thread, setThread] = useState<AssistantThreadDto>();
  const [messages, setMessages] = useState<AssistantMessageDto[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [errorKey, setErrorKey] = useState<string>();
  const messageEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const list = await apiRequest<AssistantThreadListDto>(
          `/projects/${projectId}/assistant/threads`,
        );
        if (!active) return;
        const selected =
          list.items[0] ??
          (await apiRequest<AssistantThreadDto>(
            `/projects/${projectId}/assistant/threads`,
            { method: "POST", body: JSON.stringify({}) },
          ));
        const detail = await apiRequest<AssistantThreadDetailDto>(
          `/projects/${projectId}/assistant/threads/${selected.id}`,
        );
        if (!active) return;
        setThread(detail.thread);
        setMessages(detail.messages);
      } catch (error) {
        if (active)
          setErrorKey(
            error instanceof ApiError ? error.messageKey : "errors.unknown",
          );
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [projectId]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages, sending]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || !thread || sending) return;
    setDraft("");
    setSending(true);
    setErrorKey(undefined);
    const optimistic: AssistantMessageDto = {
      id: `pending-${Date.now()}`,
      role: "user",
      content,
      created_at: new Date().toISOString(),
    };
    setMessages((current) => [...current, optimistic]);
    try {
      const result = await apiRequest<AssistantTurnDto>(
        `/projects/${projectId}/assistant/threads/${thread.id}/messages`,
        { method: "POST", body: JSON.stringify({ content }) },
      );
      setMessages((current) => [
        ...current.filter((item) => item.id !== optimistic.id),
        result.user_message,
        result.assistant_message,
      ]);
    } catch (error) {
      setMessages((current) =>
        current.filter((item) => item.id !== optimistic.id),
      );
      setDraft(content);
      setErrorKey(
        error instanceof ApiError ? error.messageKey : "errors.unknown",
      );
    } finally {
      setSending(false);
    }
  }

  function startResize(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const originX = event.clientX;
    const originWidth = width;
    const move = (pointerEvent: PointerEvent) =>
      onWidthChange(
        Math.max(
          320,
          Math.min(560, originWidth + originX - pointerEvent.clientX),
        ),
      );
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
  }

  return (
    <aside className="assistant-panel" aria-label={t("assistant.title")}>
      <div
        className="assistant-resize-handle"
        role="separator"
        aria-label={t("assistant.resize")}
        aria-orientation="vertical"
        aria-valuemin={320}
        aria-valuemax={560}
        aria-valuenow={width}
        onPointerDown={startResize}
      />
      <button
        type="button"
        className="assistant-collapse"
        aria-label={t("assistant.collapse")}
        title={t("assistant.collapse")}
        onClick={onCollapse}
      >
        ›
      </button>
      <header className="assistant-panel-header">
        <div>
          <h2>{t("assistant.title")}</h2>
          <span>{t("assistant.phaseConversation")}</span>
        </div>
      </header>
      <div className="assistant-messages" aria-live="polite">
        {loading ? <p className="assistant-status">{t("loading")}</p> : null}
        {!loading && messages.length === 0 ? (
          <div className="assistant-welcome">
            <strong>{t("assistant.welcomeTitle")}</strong>
            <p>{t("assistant.welcomeLead")}</p>
            <button
              type="button"
              onClick={() => setDraft(t("assistant.plotSuggestion"))}
            >
              {t("assistant.plotSuggestion")}
            </button>
          </div>
        ) : null}
        {messages.map((message) => (
          <article
            className={`assistant-message assistant-message--${message.role}`}
            key={message.id}
          >
            <span>
              {message.role === "user"
                ? t("assistant.you")
                : t("assistant.name")}
            </span>
            <p>{message.content}</p>
          </article>
        ))}
        {sending ? (
          <p className="assistant-status">{t("assistant.thinking")}</p>
        ) : null}
        {errorKey ? (
          <p className="assistant-error" role="alert">
            {t(errorKey)}
          </p>
        ) : null}
        <div ref={messageEndRef} />
      </div>
      <form className="assistant-composer" onSubmit={submit}>
        <textarea
          aria-label={t("assistant.input")}
          disabled={!thread || sending}
          maxLength={10_000}
          placeholder={t("assistant.placeholder")}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <button type="submit" disabled={!draft.trim() || !thread || sending}>
          {t("assistant.send")}
        </button>
      </form>
    </aside>
  );
}
