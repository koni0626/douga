import type { ReactNode } from "react";

function inlineMarkdown(text: string): ReactNode[] {
  const parts = text.split(
    /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g,
  );
  return parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`"))
      return <code key={index}>{part.slice(1, -1)}</code>;
    if (part.startsWith("**") && part.endsWith("**"))
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    const link = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(part);
    if (link)
      return (
        <a href={link[2]} key={index} rel="noreferrer" target="_blank">
          {link[1]}
        </a>
      );
    return part;
  });
}

export function MarkdownMessage({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const nodes: ReactNode[] = [];
  let codeLines: string[] = [];
  let listItems: string[] = [];

  const flushCode = () => {
    if (!codeLines.length) return;
    nodes.push(
      <pre key={`code-${nodes.length}`}>
        <code>{codeLines.join("\n")}</code>
      </pre>,
    );
    codeLines = [];
  };
  const flushList = () => {
    if (!listItems.length) return;
    nodes.push(
      <ul key={`list-${nodes.length}`}>
        {listItems.map((item, index) => (
          <li key={index}>{inlineMarkdown(item)}</li>
        ))}
      </ul>,
    );
    listItems = [];
  };

  let inCode = false;
  lines.forEach((line) => {
    if (line.trim().startsWith("```")) {
      if (inCode) flushCode();
      else flushList();
      inCode = !inCode;
      return;
    }
    if (inCode) {
      codeLines.push(line);
      return;
    }
    const list = /^\s*[-*]\s+(.+)$/.exec(line);
    if (list) {
      listItems.push(list[1] ?? "");
      return;
    }
    flushList();
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const marks = heading[1] ?? "#";
      const Tag = `h${marks.length + 2}` as "h3" | "h4" | "h5";
      nodes.push(
        <Tag key={nodes.length}>{inlineMarkdown(heading[2] ?? "")}</Tag>,
      );
    } else if (line.trim()) {
      nodes.push(<p key={nodes.length}>{inlineMarkdown(line)}</p>);
    } else {
      nodes.push(<br key={nodes.length} />);
    }
  });
  flushList();
  flushCode();
  return <div className="assistant-markdown">{nodes}</div>;
}
