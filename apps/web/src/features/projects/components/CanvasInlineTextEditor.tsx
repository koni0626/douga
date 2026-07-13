import {
  type CSSProperties,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import type { ProjectDocument } from "@douga/project-schema";

import { fitTextLayerToContent } from "../lib/textLayers";

type Layer = ProjectDocument["scenes"][number]["layers"][number];
type TextLayer = Extract<Layer, { type: "text" }>;

interface CanvasInlineTextEditorProps {
  label: string;
  layer: TextLayer;
  onCancel: () => void;
  onCommit: (text: string) => void;
}

export function CanvasInlineTextEditor({
  label,
  layer,
  onCancel,
  onCommit,
}: CanvasInlineTextEditorProps) {
  const [draft, setDraft] = useState(layer.text);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }
    if (
      event.key === "Enter" &&
      (event.ctrlKey || event.metaKey) &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      onCommit(draft);
    }
  }

  const vertical = layer.writing_mode === "vertical";
  const neon = layer.text_style === "neon";
  const fittedLayer = { ...layer, ...fitTextLayerToContent(layer, draft) };
  const inputStyle: CSSProperties = {
    color: layer.color,
    fontFamily: layer.font_family ?? "sans-serif",
    fontSize: layer.font_size,
    opacity: layer.opacity,
    textOrientation: vertical ? "upright" : undefined,
    textShadow: neon
      ? `0 0 ${Math.max(6, layer.font_size * 0.12)}px ${layer.neon_color ?? "#9bdcff"}`
      : undefined,
    writingMode: vertical ? "vertical-rl" : "horizontal-tb",
  };

  return (
    <foreignObject
      className="canvas-inline-text-editor"
      x={fittedLayer.x}
      y={fittedLayer.y}
      width={fittedLayer.width}
      height={fittedLayer.height}
    >
      <textarea
        ref={inputRef}
        aria-label={label}
        className="canvas-inline-text-input"
        value={draft}
        onBlur={() => onCommit(draft)}
        onChange={(event) => setDraft(event.target.value)}
        onDoubleClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
        onPointerDown={(event) => event.stopPropagation()}
        style={inputStyle}
      />
    </foreignObject>
  );
}
