import type { ReactNode } from "react";

type TableAlignment = "left" | "center" | "right";

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

function tableCells(line: string): string[] | undefined {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return undefined;
  const content = trimmed.replace(/^\|/, "").replace(/\|$/, "");
  const cells = content.split("|").map((cell) => cell.trim());
  return cells.length >= 2 ? cells : undefined;
}

function tableAlignments(line: string): TableAlignment[] | undefined {
  const cells = tableCells(line);
  if (!cells || !cells.every((cell) => /^:?-{3,}:?$/.test(cell)))
    return undefined;
  return cells.map((cell) => {
    if (cell.startsWith(":") && cell.endsWith(":")) return "center";
    if (cell.endsWith(":")) return "right";
    return "left";
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
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? "";
    if (line.trim().startsWith("```")) {
      if (inCode) flushCode();
      else flushList();
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      codeLines.push(line);
      continue;
    }
    const headerCells = tableCells(line);
    const alignments = tableAlignments(lines[lineIndex + 1] ?? "");
    if (headerCells && alignments?.length === headerCells.length) {
      flushList();
      const bodyRows: string[][] = [];
      lineIndex += 2;
      while (lineIndex < lines.length) {
        const cells = tableCells(lines[lineIndex] ?? "");
        if (!cells || cells.length !== headerCells.length) break;
        bodyRows.push(cells);
        lineIndex += 1;
      }
      lineIndex -= 1;
      nodes.push(
        <div className="assistant-markdown-table" key={`table-${nodes.length}`}>
          <table>
            <thead>
              <tr>
                {headerCells.map((cell, index) => (
                  <th key={index} style={{ textAlign: alignments[index] }}>
                    {inlineMarkdown(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bodyRows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td
                      key={cellIndex}
                      style={{ textAlign: alignments[cellIndex] }}
                    >
                      {inlineMarkdown(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    const list = /^\s*[-*]\s+(.+)$/.exec(line);
    if (list) {
      listItems.push(list[1] ?? "");
      continue;
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
  }
  flushList();
  flushCode();
  return <div className="assistant-markdown">{nodes}</div>;
}
