import type {
  CreativeDocumentDto,
  CreativeDocumentKind,
} from "../../../shared/lib/api";

const documentKinds: ReadonlySet<CreativeDocumentKind> = new Set([
  "brief",
  "plot",
  "script",
  "storyboard",
]);

const documentStatuses = new Set([
  "draft",
  "proposed",
  "approved",
  "superseded",
]);

export function creativeDocument(
  value: unknown,
): CreativeDocumentDto | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Partial<CreativeDocumentDto>;
  if (
    typeof item.id !== "string" ||
    typeof item.project_id !== "string" ||
    typeof item.kind !== "string" ||
    !documentKinds.has(item.kind as CreativeDocumentKind) ||
    typeof item.status !== "string" ||
    !documentStatuses.has(item.status) ||
    typeof item.version !== "number" ||
    !item.content ||
    typeof item.content !== "object" ||
    Array.isArray(item.content)
  ) {
    return undefined;
  }
  return item as CreativeDocumentDto;
}
