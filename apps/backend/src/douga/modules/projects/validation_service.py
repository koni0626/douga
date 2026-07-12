from collections import defaultdict
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from douga.core.errors import NotFoundError
from douga.modules.assets.repository import AssetRepository
from douga.modules.projects.repository import ProjectRepository
from douga.modules.projects.schemas import ProjectValidationIssue
from douga.modules.projects.service import ProjectService, load_project_validator


@dataclass(frozen=True, slots=True)
class ProjectValidationResult:
    errors: list[ProjectValidationIssue]
    warnings: list[ProjectValidationIssue]
    estimated_duration_ms: int | None

    @property
    def valid(self) -> bool:
        return not self.errors


class ProjectValidationService:
    def __init__(self, session: AsyncSession) -> None:
        self.projects = ProjectRepository(session)
        self.assets = AssetRepository(session)
        self.validator = load_project_validator()

    async def validate(
        self, project_id: UUID, user_id: UUID, document: dict[str, Any]
    ) -> ProjectValidationResult:
        if await self.projects.get_owned(project_id, user_id) is None:
            raise NotFoundError("PROJECT_NOT_FOUND", "errors.projectNotFound")
        schema_errors = self._schema_errors(document)
        errors = list(schema_errors)
        if document.get("schema_version") != 1:
            errors.append(
                self._issue(
                    "PROJECT_SCHEMA_UNSUPPORTED",
                    "errors.projectSchemaUnsupported",
                    "/schema_version",
                )
            )
        if document.get("project_id") != str(project_id):
            errors.append(
                self._issue("PROJECT_ID_MISMATCH", "errors.projectDocumentInvalid", "/project_id")
            )

        warnings: list[ProjectValidationIssue] = []
        if not schema_errors:
            references = self._asset_references(document)
            ready_ids = await self.assets.ready_owned_ids(
                user_id, {asset_id for asset_id, _ in references}
            )
            for asset_id, path in references:
                if asset_id not in ready_ids:
                    errors.append(self._issue("ASSET_NOT_READY", "errors.assetNotReady", path))

            semantic_errors, warnings = self._semantic_issues(document)
            errors.extend(semantic_errors)
        duration = None
        if not self._schema_errors(document, top_level_only=True):
            try:
                duration = ProjectService._estimated_duration(document)
            except KeyError, TypeError, ValueError:
                duration = None
        return ProjectValidationResult(
            errors=self._deduplicate(errors),
            warnings=self._deduplicate(warnings),
            estimated_duration_ms=duration,
        )

    def _schema_errors(
        self, document: dict[str, Any], *, top_level_only: bool = False
    ) -> list[ProjectValidationIssue]:
        issues: list[ProjectValidationIssue] = []
        for error in sorted(self.validator.iter_errors(document), key=lambda item: list(item.path)):
            path_parts = [str(part) for part in error.absolute_path]
            if top_level_only and path_parts:
                continue
            path = "/" + "/".join(path_parts) if path_parts else "/"
            issues.append(
                self._issue("PROJECT_SCHEMA_INVALID", "errors.projectDocumentInvalid", path)
            )
        return issues

    @staticmethod
    def _asset_references(document: dict[str, Any]) -> list[tuple[UUID, str]]:
        references: list[tuple[UUID, str]] = []
        for scene_index, scene in enumerate(document.get("scenes", [])):
            background = scene.get("background", {})
            if background.get("type") == "asset":
                try:
                    references.append(
                        (
                            UUID(str(background["asset_id"])),
                            f"/scenes/{scene_index}/background/asset_id",
                        )
                    )
                except KeyError, ValueError:
                    pass
            for layer_index, layer in enumerate(scene.get("layers", [])):
                if layer.get("type") == "image":
                    try:
                        references.append(
                            (
                                UUID(str(layer["asset_id"])),
                                f"/scenes/{scene_index}/layers/{layer_index}/asset_id",
                            )
                        )
                    except KeyError, ValueError:
                        pass
        for track_index, track in enumerate(document.get("audio_tracks", [])):
            try:
                references.append(
                    (UUID(str(track["asset_id"])), f"/audio_tracks/{track_index}/asset_id")
                )
            except KeyError, ValueError:
                pass
        return references

    def _semantic_issues(
        self, document: dict[str, Any]
    ) -> tuple[list[ProjectValidationIssue], list[ProjectValidationIssue]]:
        errors: list[ProjectValidationIssue] = []
        warnings: list[ProjectValidationIssue] = []
        duration = int(document.get("video", {}).get("duration_ms") or 0)
        intervals: dict[str, list[tuple[int, int, str]]] = defaultdict(list)
        covered: list[tuple[int, int]] = []
        for scene_index, scene in enumerate(document.get("scenes", [])):
            for layer_index, layer in enumerate(scene.get("layers", [])):
                path = f"/scenes/{scene_index}/layers/{layer_index}"
                start = int(layer.get("start_ms", 0))
                end = int(layer.get("end_ms", duration or 1))
                if end <= start:
                    errors.append(
                        self._issue("CLIP_RANGE_INVALID", "errors.clipRangeInvalid", path)
                    )
                if duration and end > duration:
                    errors.append(self._issue("CLIP_OUT_OF_RANGE", "errors.clipOutOfRange", path))
                for keyframe_index, keyframe in enumerate(layer.get("keyframes", [])):
                    time_ms = int(keyframe.get("time_ms", -1))
                    if time_ms < start or time_ms > end:
                        errors.append(
                            self._issue(
                                "KEYFRAME_OUT_OF_RANGE",
                                "errors.keyframeOutOfRange",
                                f"{path}/keyframes/{keyframe_index}/time_ms",
                            )
                        )
                if layer.get("type") == "text" and not str(layer.get("text", "")).strip():
                    warnings.append(
                        self._issue("EMPTY_CAPTION", "warnings.emptyCaption", f"{path}/text")
                    )
                track_id = str(layer.get("track_id") or layer.get("id") or path)
                intervals[track_id].append((start, end, path))
                if end > start:
                    covered.append((start, end))

        for track_index, track in enumerate(document.get("audio_tracks", [])):
            path = f"/audio_tracks/{track_index}"
            track_duration = int(track.get("duration_ms") or 0)
            if int(track.get("fade_in_ms", 0)) + int(track.get("fade_out_ms", 0)) > track_duration:
                errors.append(self._issue("AUDIO_FADE_TOO_LONG", "errors.audioFadeTooLong", path))

        for entries in intervals.values():
            ordered = sorted(entries)
            for previous, current in zip(ordered, ordered[1:], strict=False):
                if current[0] < previous[1]:
                    warnings.append(
                        self._issue(
                            "TRACK_CLIP_OVERLAP",
                            "warnings.trackClipOverlap",
                            current[2],
                            current[0],
                            min(previous[1], current[1]),
                        )
                    )

        if duration > 0 and covered:
            cursor = 0
            for start, end in sorted(covered):
                if start > cursor:
                    warnings.append(
                        self._issue(
                            "TIMELINE_GAP",
                            "warnings.timelineGap",
                            None,
                            cursor,
                            start,
                        )
                    )
                cursor = max(cursor, end)
            if cursor < duration:
                warnings.append(
                    self._issue(
                        "TIMELINE_GAP",
                        "warnings.timelineGap",
                        None,
                        cursor,
                        duration,
                    )
                )
        return errors, warnings

    @staticmethod
    def _issue(
        code: str,
        message_key: str,
        path: str | None = None,
        start_ms: int | None = None,
        end_ms: int | None = None,
    ) -> ProjectValidationIssue:
        return ProjectValidationIssue(
            code=code,
            path=path,
            message_key=message_key,
            start_ms=start_ms,
            end_ms=end_ms,
        )

    @staticmethod
    def _deduplicate(issues: list[ProjectValidationIssue]) -> list[ProjectValidationIssue]:
        unique: dict[tuple[object, ...], ProjectValidationIssue] = {}
        for issue in issues:
            key = (issue.code, issue.path, issue.start_ms, issue.end_ms)
            unique[key] = issue
        return list(unique.values())
