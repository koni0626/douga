export type EditorTool =
  "dialogues" | "layers" | "camera" | "audio" | "caption";

type ToolDefinition = {
  id: EditorTool;
  label: string;
  icon: "dialogue" | "layers" | "camera" | "audio" | "caption";
};

function ToolIcon({ icon }: { icon: ToolDefinition["icon"] }) {
  if (icon === "dialogue") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-5 3v-3H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />
        <path d="M7 9h10M7 13h7" />
      </svg>
    );
  }
  if (icon === "layers") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m12 3 9 5-9 5-9-5 9-5Z" />
        <path d="m3 12 9 5 9-5M3 16l9 5 9-5" />
      </svg>
    );
  }
  if (icon === "audio") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 18V6l10-2v12" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="16" cy="16" r="3" />
      </svg>
    );
  }
  if (icon === "camera") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="6" width="18" height="13" rx="2" />
        <circle cx="12" cy="12.5" r="3.5" />
        <path d="M8 6l1.5-2h5L16 6" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="M8 9h8M12 9v7M9 16h6" />
    </svg>
  );
}

export function FloatingEditorTools({
  activeTool,
  labels,
  onSelect,
  toolbarLabel,
}: {
  activeTool: EditorTool | null;
  labels: Record<EditorTool, string>;
  onSelect: (tool: EditorTool | null) => void;
  toolbarLabel: string;
}) {
  const tools: ToolDefinition[] = [
    { id: "dialogues", label: labels.dialogues, icon: "dialogue" },
    { id: "layers", label: labels.layers, icon: "layers" },
    { id: "camera", label: labels.camera, icon: "camera" },
    { id: "audio", label: labels.audio, icon: "audio" },
    { id: "caption", label: labels.caption, icon: "caption" },
  ];

  return (
    <div
      className="floating-editor-toolbar"
      role="toolbar"
      aria-label={toolbarLabel}
    >
      {tools.map((tool) => (
        <button
          key={tool.id}
          type="button"
          className={
            activeTool === tool.id
              ? "floating-tool floating-tool--active"
              : "floating-tool"
          }
          aria-label={tool.label}
          aria-pressed={activeTool === tool.id}
          title={tool.label}
          onClick={() => onSelect(activeTool === tool.id ? null : tool.id)}
        >
          <ToolIcon icon={tool.icon} />
        </button>
      ))}
    </div>
  );
}
