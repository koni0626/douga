import type { StreamTargetChunk } from "mediabunny";

interface SaveFilePickerOptions {
  suggestedName: string;
  types: Array<{
    description: string;
    accept: Record<string, string[]>;
  }>;
}

type SaveFilePicker = (
  options: SaveFilePickerOptions,
) => Promise<FileSystemFileHandle>;

function safeMp4Filename(filename: string) {
  const withExtension = filename.toLowerCase().endsWith(".mp4")
    ? filename
    : `${filename}.mp4`;
  return Array.from(withExtension, (character) =>
    character.charCodeAt(0) < 32 || /[<>:"/\\|?*]/u.test(character)
      ? "_"
      : character,
  ).join("");
}

export async function createBrowserExportWritable(filename: string) {
  const picker = (window as Window & { showSaveFilePicker?: SaveFilePicker })
    .showSaveFilePicker;
  if (!picker) return undefined;
  const handle = await picker.call(window, {
    suggestedName: safeMp4Filename(filename),
    types: [
      {
        description: "MP4 video",
        accept: { "video/mp4": [".mp4"] },
      },
    ],
  });
  return (await handle.createWritable()) as WritableStream<StreamTargetChunk>;
}

export function isBrowserExportPickerCanceled(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}
