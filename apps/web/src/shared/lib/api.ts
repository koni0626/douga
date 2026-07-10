export interface UserDto {
  id: string;
  email: string;
  preferred_locale: "ja" | "en";
}

export interface SettingsDto {
  preferred_locale: "ja" | "en";
  default_content_locale: "ja" | "en";
  default_video_width: number;
  default_video_height: number;
  default_video_fps: string;
  default_caption_settings: Record<string, unknown>;
}

interface ErrorResponse {
  error?: { code?: string; message_key?: string };
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly messageKey: string,
  ) {
    super(code);
  }
}

const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";

function cookieValue(name: string): string | undefined {
  const prefix = `${encodeURIComponent(name)}=`;
  return document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  const method = (init.method ?? "GET").toUpperCase();
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const csrf = cookieValue("douga_csrf");
    if (csrf) headers.set("X-CSRF-Token", decodeURIComponent(csrf));
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as ErrorResponse;
    throw new ApiError(
      response.status,
      payload.error?.code ?? "UNKNOWN_ERROR",
      payload.error?.message_key ?? "errors.unknown",
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
