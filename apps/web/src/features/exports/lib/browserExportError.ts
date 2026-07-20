export type BrowserExportErrorCode =
  | "unsupported"
  | "asset_load_failed"
  | "audio_decode_failed"
  | "encode_failed"
  | "canceled";

export class BrowserExportError extends Error {
  constructor(
    readonly code: BrowserExportErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "BrowserExportError";
  }
}

export interface BrowserExportDiagnostic {
  name: string;
  message: string;
  code?: string;
}

export function browserExportDiagnostics(error: unknown) {
  const diagnostics: BrowserExportDiagnostic[] = [];
  const visited = new Set<unknown>();
  let current: unknown = error;
  while (current && !visited.has(current) && diagnostics.length < 8) {
    visited.add(current);
    if (current instanceof Error) {
      diagnostics.push({
        name: current.name,
        message: current.message,
        code: current instanceof BrowserExportError ? current.code : undefined,
      });
      current = current.cause;
    } else {
      diagnostics.push({ name: typeof current, message: String(current) });
      break;
    }
  }
  return diagnostics;
}

export function throwIfBrowserExportCanceled(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new BrowserExportError("canceled", "Browser export was canceled");
  }
}
