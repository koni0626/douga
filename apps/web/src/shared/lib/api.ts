import type { ProjectDocument } from "@douga/project-schema";

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

export interface ApiTokenDto {
  id: string;
  name: string;
  token_prefix: string;
  scopes: string[];
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface ApiTokenIssuedDto extends ApiTokenDto {
  token: string;
}

export interface ApiTokenListDto {
  items: ApiTokenDto[];
}

export interface ProjectSummaryDto {
  id: string;
  name: string;
  status: "draft" | "editing" | "rendered" | "archived";
  content_locale: "ja" | "en";
  current_revision_number: number;
  lock_version: number;
  scene_count: number;
  estimated_duration_ms: number | null;
  thumbnail_asset_id: string | null;
  updated_at: string;
}

export interface ProjectDetailDto {
  project: ProjectSummaryDto;
  document: ProjectDocument;
}

export interface ProjectListDto {
  items: ProjectSummaryDto[];
  total: number;
}

export interface AssetDto {
  id: string;
  kind: "image" | "video" | "audio";
  source: "upload" | "generated" | "system";
  status: "pending" | "processing" | "ready" | "failed";
  name: string;
  original_filename: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  tags: string[];
}

export interface AssetListDto {
  items: AssetDto[];
  total: number;
}

export interface UploadTargetDto {
  asset: AssetDto;
  upload_path: string;
}

export interface ImageGenerationDto {
  id: string;
  job_id: string;
  prompt: string;
  model: string;
  quality: "low" | "medium" | "high";
  size: "1024x1024" | "1024x1536" | "1536x1024";
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  progress: number;
  output_asset_id: string | null;
  error_code: string | null;
  created_at: string;
}

export interface ImageGenerationListDto {
  items: ImageGenerationDto[];
  total: number;
}

export interface ExportDto {
  id: string;
  project_id: string;
  project_revision_id: string;
  job_id: string;
  name: string;
  kind: "export" | "preview";
  range_start_ms: number | null;
  range_end_ms: number | null;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  progress: number;
  width: number;
  height: number;
  fps: number;
  size_bytes: number | null;
  duration_ms: number | null;
  error_code: string | null;
  created_at: string;
}

export interface ExportListDto {
  items: ExportDto[];
  total: number;
}

export interface AssistantThreadDto {
  id: string;
  project_id: string;
  title: string;
  status: "active" | "archived";
  created_at: string;
  updated_at: string;
}

export interface AssistantMessageDto {
  id: string;
  role: "user" | "assistant" | "system_summary";
  content: string;
  created_at: string;
}

export interface AssistantThreadListDto {
  items: AssistantThreadDto[];
}

export interface AssistantThreadDetailDto {
  thread: AssistantThreadDto;
  messages: AssistantMessageDto[];
  runs: AssistantRunDto[];
  tool_calls: AssistantToolCallDto[];
}

export interface AssistantRunDto {
  id: string;
  status:
    | "queued"
    | "running"
    | "waiting_approval"
    | "completed"
    | "failed"
    | "cancelled";
  error_code: string | null;
  base_revision_number: number;
  result_revision_number: number | null;
  undo_revision_number: number | null;
  created_at: string;
}

export interface AssistantToolCallDto {
  id: string;
  run_id: string;
  tool_name: string;
  arguments_json: Record<string, unknown>;
  result_json: Record<string, unknown> | null;
  status:
    | "requested"
    | "waiting_approval"
    | "running"
    | "completed"
    | "failed"
    | "cancelled";
  approval_required: boolean;
  approved_at: string | null;
  created_at: string;
  finished_at: string | null;
}

export interface ImageArtifactDto {
  artifact_type: "image";
  request_id: string;
  asset_id: string;
  prompt: string;
  size: string;
  quality: string;
}

export interface VideoArtifactDto {
  artifact_type: "video_preview" | "video_export";
  export_id: string;
  name: string;
  status: string;
  duration_ms: number | null;
  range_start_ms: number | null;
  range_end_ms: number | null;
  error_code: string | null;
}

export interface AssistantRunStartedDto {
  run_id: string;
  status: "queued" | "running";
  user_message: AssistantMessageDto;
}

export type CreativeDocumentKind = "brief" | "plot" | "script" | "storyboard";

export interface CreativeDocumentDto {
  id: string;
  project_id: string;
  kind: CreativeDocumentKind;
  status: "draft" | "proposed" | "approved" | "superseded";
  version: number;
  content: Record<string, unknown>;
  source_run_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreativeDocumentListDto {
  items: CreativeDocumentDto[];
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
const apiOrigin = new URL(apiBaseUrl).origin;

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

export async function apiUpload(path: string, file: File): Promise<AssetDto> {
  const csrf = cookieValue("douga_csrf");
  const response = await fetch(`${apiOrigin}${path}`, {
    method: "PUT",
    body: file,
    credentials: "include",
    headers: csrf ? { "X-CSRF-Token": decodeURIComponent(csrf) } : undefined,
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as ErrorResponse;
    throw new ApiError(
      response.status,
      payload.error?.code ?? "UNKNOWN_ERROR",
      payload.error?.message_key ?? "errors.unknown",
    );
  }
  return (await response.json()) as AssetDto;
}

export function assetContentUrl(assetId: string): string {
  return `${apiBaseUrl}/assets/${assetId}/content`;
}

export function exportContentUrl(exportId: string): string {
  return `${apiBaseUrl}/exports/${exportId}/content`;
}

export function assistantEventsUrl(projectId: string, runId: string): string {
  return `${apiBaseUrl}/projects/${projectId}/assistant/runs/${runId}/events`;
}
