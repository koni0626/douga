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
  type CreativeDocumentDto,
  type CreativeDocumentListDto,
} from "../../../shared/lib/api";
import { CreativeDocumentCard } from "./CreativeDocumentCard";
import { MarkdownMessage } from "./MarkdownMessage";

interface AssistantPanelProps {
  canRun: boolean;
  editorContext: {
    selected_layer_id: string | null;
    time_ms: number;
    visible_end_ms: number;
    visible_start_ms: number;
  };
  onCollapse: () => void;
  onProjectChanged: () => void;
  onWidthChange: (width: number) => void;
  projectId: string;
  width: number;
}

export function AssistantPanel({
  canRun,
  editorContext,
  onCollapse,
  onProjectChanged,
  onWidthChange,
  projectId,
  width,
}: AssistantPanelProps) {
  const { t } = useTranslation();
  const [threads, setThreads] = useState<AssistantThreadDto[]>([]);
  const [thread, setThread] = useState<AssistantThreadDto>();
  const [messages, setMessages] = useState<AssistantMessageDto[]>([]);
  const [documents, setDocuments] = useState<CreativeDocumentDto[]>([]);
  const [adoptingId, setAdoptingId] = useState<string>();
  const [undoableRunId, setUndoableRunId] = useState<string>();
  const [undoing, setUndoing] = useState(false);
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
        const [list, documentList] = await Promise.all([
          apiRequest<AssistantThreadListDto>(
            `/projects/${projectId}/assistant/threads`,
          ),
          apiRequest<CreativeDocumentListDto>(
            `/projects/${projectId}/creative-documents`,
          ),
        ]);
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
        setDocuments(documentList.items);
        setUndoableRunId(
          detail.runs.find(
            (run) =>
              run.status === "completed" &&
              run.result_revision_number !== null &&
              run.undo_revision_number === null,
          )?.id,
        );
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
        {
          method: "POST",
          body: JSON.stringify({ content, context: editorContext }),
        },
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
      setUndoableRunId(
        detail.runs.find(
          (run) =>
            run.status === "completed" &&
            run.result_revision_number !== null &&
            run.undo_revision_number === null,
        )?.id,
      );
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
      setUndoableRunId(undefined);
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
    source.addEventListener("artifact.created", (event) => {
      const { artifact } = JSON.parse(event.data) as {
        artifact: CreativeDocumentDto;
      };
      setDocuments((current) => [
        artifact,
        ...current.filter((item) => item.kind !== artifact.kind),
      ]);
    });
    const finish = () => {
      source.close();
      if (eventSourceRef.current === source) eventSourceRef.current = null;
      setSending(false);
    };
    source.addEventListener("run.completed", (event) => {
      const result = JSON.parse(event.data) as {
        result_revision_number: number | null;
      };
      if (result.result_revision_number !== null) setUndoableRunId(runId);
      finish();
    });
    source.addEventListener("run.cancelled", finish);
    source.addEventListener("run.failed", () => {
      setErrorKey("errors.assistantUnavailable");
      finish();
    });
    source.addEventListener("project.revision_created", () => {
      onProjectChanged();
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

  async function adoptDocument(document: CreativeDocumentDto) {
    if (adoptingId) return;
    setAdoptingId(document.id);
    setErrorKey(undefined);
    try {
      const adopted = await apiRequest<CreativeDocumentDto>(
        `/projects/${projectId}/creative-documents/${document.id}/adopt`,
        { method: "POST" },
      );
      setDocuments((current) => [
        adopted,
        ...current.filter((item) => item.kind !== adopted.kind),
      ]);
    } catch (error) {
      setErrorKey(
        error instanceof ApiError ? error.messageKey : "errors.unknown",
      );
    } finally {
      setAdoptingId(undefined);
    }
  }

  async function undoRun() {
    if (!undoableRunId || undoing) return;
    setUndoing(true);
    setErrorKey(undefined);
    try {
      await apiRequest(
        `/projects/${projectId}/assistant/runs/${undoableRunId}/undo`,
        { method: "POST" },
      );
      setUndoableRunId(undefined);
      onProjectChanged();
    } catch (error) {
      setErrorKey(
        error instanceof ApiError ? error.messageKey : "errors.unknown",
      );
    } finally {
      setUndoing(false);
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
        {documents.map((document) => (
          <CreativeDocumentCard
            adopting={adoptingId === document.id}
            document={document}
            key={document.id}
            onAdopt={(item) => void adoptDocument(item)}
          />
        ))}
        {undoableRunId ? (
          <button
            type="button"
            className="assistant-undo"
            disabled={undoing}
            onClick={() => void undoRun()}
          >
            {undoing ? t("assistant.undoing") : t("assistant.undoRun")}
          </button>
        ) : null}
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
          disabled={!thread || sending || !canRun}
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
        <button
          type="submit"
          disabled={!draft.trim() || !thread || sending || !canRun}
        >
          {t("assistant.send")}
        </button>
        {!canRun ? (
          <small className="assistant-save-required">
            {t("assistant.saveRequired")}
          </small>
        ) : null}
      </form>
    </aside>
  );
}
