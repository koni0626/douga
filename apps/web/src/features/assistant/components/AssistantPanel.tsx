import { type FormEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  ApiError,
  apiRequest,
  assistantEventsUrl,
  type AssistantMessageDto,
  type AssistantThreadDetailDto,
  type AssistantThreadDto,
  type AssistantThreadListDto,
  type AssistantRunStartedDto,
} from "../../../shared/lib/api";
import { MarkdownMessage } from "./MarkdownMessage";

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
  const [threads, setThreads] = useState<AssistantThreadDto[]>([]);
  const [thread, setThread] = useState<AssistantThreadDto>();
  const [messages, setMessages] = useState<AssistantMessageDto[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [errorKey, setErrorKey] = useState<string>();
  const messageEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

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
        setThreads(list.items.length ? list.items : [selected]);
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
      eventSourceRef.current?.close();
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
      const result = await apiRequest<AssistantRunStartedDto>(
        `/projects/${projectId}/assistant/threads/${thread.id}/messages`,
        { method: "POST", body: JSON.stringify({ content }) },
      );
      setMessages((current) => [
        ...current.filter((item) => item.id !== optimistic.id),
        result.user_message,
      ]);
      listenToRun(result.run_id);
    } catch (error) {
      setMessages((current) =>
        current.filter((item) => item.id !== optimistic.id),
      );
      setDraft(content);
      setErrorKey(
        error instanceof ApiError ? error.messageKey : "errors.unknown",
      );
      setSending(false);
    }
  }

  async function selectThread(threadId: string) {
    if (threadId === thread?.id || sending) return;
    setLoading(true);
    setErrorKey(undefined);
    try {
      const detail = await apiRequest<AssistantThreadDetailDto>(
        `/projects/${projectId}/assistant/threads/${threadId}`,
      );
      setThread(detail.thread);
      setMessages(detail.messages);
    } catch (error) {
      setErrorKey(
        error instanceof ApiError ? error.messageKey : "errors.unknown",
      );
    } finally {
      setLoading(false);
    }
  }

  async function createThread() {
    if (sending) return;
    setLoading(true);
    setErrorKey(undefined);
    try {
      const created = await apiRequest<AssistantThreadDto>(
        `/projects/${projectId}/assistant/threads`,
        {
          method: "POST",
          body: JSON.stringify({ title: t("assistant.newConversationTitle") }),
        },
      );
      setThreads((current) => [created, ...current]);
      setThread(created);
      setMessages([]);
      setDraft("");
    } catch (error) {
      setErrorKey(
        error instanceof ApiError ? error.messageKey : "errors.unknown",
      );
    } finally {
      setLoading(false);
    }
  }

  function listenToRun(runId: string) {
    eventSourceRef.current?.close();
    const source = new EventSource(assistantEventsUrl(projectId, runId), {
      withCredentials: true,
    });
    eventSourceRef.current = source;
    const pendingId = `stream-${runId}`;

    source.addEventListener("message.delta", (event) => {
      const { delta } = JSON.parse(event.data) as { delta: string };
      setMessages((current) => {
        const existing = current.find((item) => item.id === pendingId);
        if (!existing)
          return [
            ...current,
            {
              id: pendingId,
              role: "assistant",
              content: delta,
              created_at: new Date().toISOString(),
            },
          ];
        return current.map((item) =>
          item.id === pendingId
            ? { ...item, content: `${item.content}${delta}` }
            : item,
        );
      });
    });
    source.addEventListener("message.completed", (event) => {
      const { message } = JSON.parse(event.data) as {
        message: AssistantMessageDto;
      };
      setMessages((current) => [
        ...current.filter((item) => item.id !== pendingId),
        message,
      ]);
    });
    const finish = () => {
      source.close();
      if (eventSourceRef.current === source) eventSourceRef.current = null;
      setSending(false);
    };
    source.addEventListener("run.completed", finish);
    source.addEventListener("run.cancelled", finish);
    source.addEventListener("run.failed", () => {
      setErrorKey("errors.assistantUnavailable");
      finish();
    });
    source.onopen = () => setErrorKey(undefined);
    source.onerror = () => {
      if (eventSourceRef.current !== source) return;
      setErrorKey("errors.assistantStreamDisconnected");
    };
  }

  async function cancelRun() {
    const source = eventSourceRef.current;
    if (!source) return;
    const url = new URL(source.url);
    const runId = url.pathname.split("/").at(-2);
    if (!runId) return;
    try {
      await apiRequest(
        `/projects/${projectId}/assistant/runs/${runId}/cancel`,
        {
          method: "POST",
        },
      );
    } catch (error) {
      setErrorKey(
        error instanceof ApiError ? error.messageKey : "errors.unknown",
      );
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
        <button
          type="button"
          disabled={sending || loading}
          onClick={() => void createThread()}
          title={t("assistant.newConversation")}
        >
          ＋
        </button>
      </header>
      <div className="assistant-thread-picker">
        <label htmlFor="assistant-thread-select">
          {t("assistant.history")}
        </label>
        <select
          id="assistant-thread-select"
          disabled={sending || loading}
          onChange={(event) => void selectThread(event.target.value)}
          value={thread?.id ?? ""}
        >
          {threads.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </select>
      </div>
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
            <MarkdownMessage content={message.content} />
          </article>
        ))}
        {sending ? (
          <div className="assistant-running">
            <p className="assistant-status">{t("assistant.thinking")}</p>
            <button type="button" onClick={() => void cancelRun()}>
              {t("assistant.stop")}
            </button>
          </div>
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
