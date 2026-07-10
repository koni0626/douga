import type { ProjectDocument } from "@douga/project-schema";

export type ContentLocale = ProjectDocument["content_locale"];
export type CaptionStyle = ProjectDocument["caption_style"];
export type Scene = ProjectDocument["scenes"][number];
export type Dialogue = Scene["dialogues"][number];

export interface CaptionPage {
  dialogueId: string;
  lines: string[];
  text: string;
}

export type TextMeasurer = (text: string, fontSize: number) => number;

const prohibitedLineStart = new Set(
  Array.from(
    "、。，．・：；？！ー)]｝〕〉》」』】〙〗’”ぁぃぅぇぉっゃゅょァィゥェォッャュョヮヵヶ",
  ),
);
const prohibitedLineEnd = new Set(Array.from("([｛〔〈《「『【〘〖‘“"));

export const estimateTextWidth: TextMeasurer = (text, fontSize) => {
  let units = 0;
  for (const character of Array.from(text)) {
    if (/\s/u.test(character)) {
      units += 0.33;
    } else if ((character.codePointAt(0) ?? 256) <= 0xff) {
      units += 0.58;
    } else {
      units += 1;
    }
  }
  return units * fontSize;
};

function splitByManualBreaks(text: string, offsets: number[]): string[] {
  const validOffsets = [...new Set(offsets)]
    .filter((offset) => offset > 0 && offset < text.length)
    .sort((left, right) => left - right);
  const segments: string[] = [];
  let start = 0;

  for (const offset of validOffsets) {
    segments.push(text.slice(start, offset));
    start = offset;
  }
  segments.push(text.slice(start));
  return segments;
}

function splitOversizedToken(
  token: string,
  maxWidth: number,
  fontSize: number,
  measure: TextMeasurer,
): string[] {
  const pieces: string[] = [];
  let current = "";
  for (const character of Array.from(token)) {
    const candidate = current + character;
    if (current && measure(candidate, fontSize) > maxWidth) {
      pieces.push(current);
      current = character;
    } else {
      current = candidate;
    }
  }
  if (current) {
    pieces.push(current);
  }
  return pieces;
}

function englishTokens(paragraph: string): string[] {
  return paragraph.match(/\S+\s*/gu) ?? [];
}

function japaneseTokens(paragraph: string): string[] {
  return Array.from(paragraph);
}

function wrapParagraph(
  paragraph: string,
  locale: ContentLocale,
  maxWidth: number,
  fontSize: number,
  measure: TextMeasurer,
): string[] {
  if (!paragraph) {
    return [""];
  }

  const sourceTokens =
    locale === "en" ? englishTokens(paragraph) : japaneseTokens(paragraph);
  const tokens = sourceTokens.flatMap((token) =>
    measure(token.trimEnd(), fontSize) > maxWidth
      ? splitOversizedToken(token, maxWidth, fontSize, measure)
      : [token],
  );
  const lines: string[] = [];
  let current = "";

  for (const token of tokens) {
    const candidate = current + token;
    if (!current || measure(candidate.trimEnd(), fontSize) <= maxWidth) {
      current = candidate;
      continue;
    }

    if (locale === "ja" && prohibitedLineStart.has(token[0] ?? "")) {
      current = candidate;
      continue;
    }

    if (locale === "ja" && prohibitedLineEnd.has(current.at(-1) ?? "")) {
      const moved = current.at(-1) ?? "";
      current = current.slice(0, -1);
      if (current) {
        lines.push(current.trimEnd());
      }
      current = moved + token;
      continue;
    }

    lines.push(current.trimEnd());
    current = token.trimStart();
  }

  if (current || lines.length === 0) {
    lines.push(current.trimEnd());
  }
  return lines;
}

export function layoutDialogue(
  dialogue: Dialogue,
  style: CaptionStyle,
  locale: ContentLocale,
  measure: TextMeasurer = estimateTextWidth,
): CaptionPage[] {
  const maxWidth = Math.max(1, style.width - style.padding * 2);
  const forcedSegments = splitByManualBreaks(
    dialogue.text,
    dialogue.manual_page_breaks,
  );
  const pages: CaptionPage[] = [];

  for (const segment of forcedSegments) {
    const lines = segment
      .split("\n")
      .flatMap((paragraph) =>
        wrapParagraph(paragraph, locale, maxWidth, style.font_size, measure),
      );

    for (let index = 0; index < lines.length; index += style.max_lines) {
      const pageLines = lines.slice(index, index + style.max_lines);
      pages.push({
        dialogueId: dialogue.id,
        lines: pageLines,
        text: pageLines.join("\n"),
      });
    }
  }

  return pages.length > 0
    ? pages
    : [{ dialogueId: dialogue.id, lines: [""], text: "" }];
}

function punctuationPauseMs(text: string, locale: ContentLocale): number {
  if (locale === "ja") {
    return (
      (text.match(/、/gu)?.length ?? 0) * 200 +
      (text.match(/[。！？]/gu)?.length ?? 0) * 500
    );
  }
  return (
    (text.match(/[,;:]/gu)?.length ?? 0) * 150 +
    (text.match(/[.!?]/gu)?.length ?? 0) * 400
  );
}

export function calculateAutoDurationMs(
  text: string,
  locale: ContentLocale,
): number {
  const base =
    locale === "ja"
      ? Array.from(text.replace(/\s/gu, "")).length * 100
      : (text.trim().match(/\S+/gu)?.length ?? 0) * (1000 / 3);
  return Math.max(
    2000,
    Math.round(base + punctuationPauseMs(text, locale) + 800),
  );
}

export interface TimedCaptionPage extends CaptionPage {
  dialogue: Dialogue;
  startMs: number;
  endMs: number;
}

export function buildSceneTimeline(
  scene: Scene,
  style: CaptionStyle,
  locale: ContentLocale,
  measure: TextMeasurer = estimateTextWidth,
): TimedCaptionPage[] {
  const timeline: TimedCaptionPage[] = [];
  let cursor = 0;

  for (const dialogue of scene.dialogues) {
    const pages = layoutDialogue(dialogue, style, locale, measure);
    const manualPageDuration =
      dialogue.duration_mode === "manual" && dialogue.duration_ms
        ? Math.max(1, Math.round(dialogue.duration_ms / pages.length))
        : undefined;

    for (const page of pages) {
      const duration =
        manualPageDuration ?? calculateAutoDurationMs(page.text, locale);
      timeline.push({
        ...page,
        dialogue,
        startMs: cursor,
        endMs: cursor + duration,
      });
      cursor += duration;
    }
  }
  return timeline;
}

export interface ResolvedCaption {
  lines: string[];
  opacity: number;
  page?: TimedCaptionPage;
}

export function resolveCaptionAtTime(
  timeline: TimedCaptionPage[],
  timeMs: number,
  typewriterCharactersPerSecond = 20,
): ResolvedCaption {
  const page = timeline.find(
    (candidate) => timeMs >= candidate.startMs && timeMs < candidate.endMs,
  );
  if (!page) {
    return { lines: [], opacity: 0 };
  }

  const localTime = Math.max(0, timeMs - page.startMs);
  if (page.dialogue.display_effect === "typewriter") {
    const visibleCharacters = Math.floor(
      (localTime / 1000) * typewriterCharactersPerSecond,
    );
    return {
      lines: page.text.slice(0, visibleCharacters).split("\n"),
      opacity: 1,
      page,
    };
  }

  if (page.dialogue.display_effect === "fade") {
    return {
      lines: page.lines,
      opacity: Math.min(1, localTime / 350),
      page,
    };
  }

  return { lines: page.lines, opacity: 1, page };
}
