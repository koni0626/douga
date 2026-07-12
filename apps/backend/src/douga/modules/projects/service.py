import json
from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime
from hashlib import sha256
from pathlib import Path
from typing import Any, Literal
from uuid import UUID, uuid4

from jsonschema import Draft202012Validator
from sqlalchemy.ext.asyncio import AsyncSession

from douga.core.errors import ConflictError, NotFoundError
from douga.db.unit_of_work import UnitOfWork
from douga.modules.assets.service import AssetService
from douga.modules.auth.service import AuthService
from douga.modules.projects.models import Project, ProjectAsset, ProjectRevision
from douga.modules.projects.repository import ProjectRepository

Locale = Literal["ja", "en"]


@dataclass(frozen=True, slots=True)
class ProjectSummary:
    id: UUID
    name: str
    status: str
    content_locale: str
    current_revision_number: int
    lock_version: int
    scene_count: int
    estimated_duration_ms: int | None
    thumbnail_asset_id: UUID | None
    updated_at: datetime


@dataclass(frozen=True, slots=True)
class ProjectDetail:
    project: ProjectSummary
    document: dict[str, Any]


@dataclass(frozen=True, slots=True)
class ProjectList:
    items: list[ProjectSummary]
    total: int


def canonical_document_hash(document: dict[str, Any]) -> str:
    encoded = json.dumps(
        document, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")
    return sha256(encoded).hexdigest()


def default_caption_style() -> dict[str, Any]:
    return {
        "x": 140,
        "y": 760,
        "width": 1640,
        "height": 240,
        "padding": 40,
        "font_family": "sans-serif",
        "font_size": 56,
        "font_weight": 700,
        "line_height": 1.35,
        "max_lines": 2,
        "text_color": "#ffffff",
        "background_color": "#000000",
        "background_opacity": 0.75,
        "border_radius": 24,
        "text_align": "left",
    }


def load_project_validator() -> Draft202012Validator:
    schema_path = Path("packages/project-schema/schema/project-v1.schema.json")
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    return Draft202012Validator(schema)


class ProjectService:
    def __init__(self, session: AsyncSession) -> None:
        self.repository = ProjectRepository(session)
        self.auth_service = AuthService(session)
        self.asset_service = AssetService(session)
        self.uow = UnitOfWork(session)
        self.validator = load_project_validator()

    async def list_projects(
        self,
        user_id: UUID,
        *,
        search: str | None = None,
        status: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> ProjectList:
        projects, total = await self.repository.list_owned(
            user_id, search=search, status=status, limit=limit, offset=offset
        )
        missing = [project.id for project in projects if project.thumbnail_asset_id is None]
        revisions = await self.repository.get_current_revisions_owned(missing, user_id)
        summaries = [
            self._summary(
                project,
                project_thumbnail_asset_id(revisions[project.id].document)
                if project.id in revisions
                else None,
            )
            for project in projects
        ]
        return ProjectList(summaries, total)

    async def create_project(
        self, user_id: UUID, name: str, content_locale: Locale | None
    ) -> ProjectDetail:
        settings = await self.auth_service.get_settings(user_id)
        locale = content_locale or settings.default_content_locale
        project_id = uuid4()
        document = {
            "schema_version": 1,
            "project_id": str(project_id),
            "name": name,
            "content_locale": locale,
            "video": {
                "width": settings.default_video_width,
                "height": settings.default_video_height,
                "fps": float(settings.default_video_fps),
            },
            "caption_style": {**default_caption_style(), **settings.default_caption_settings},
            # Schema v1 keeps the legacy scenes array as a storage envelope.
            # The editor exposes this as a single canvas, not as user-facing scenes.
            "scenes": [
                {
                    "id": str(uuid4()),
                    "name": "Canvas",
                    "background": {"type": "color", "color": "#16324f"},
                    "layers": [],
                    "dialogues": [],
                }
            ],
            "audio_tracks": [],
        }
        self._validate_document(document, project_id)
        project = Project(
            id=project_id,
            user_id=user_id,
            name=name,
            content_locale=locale,
            current_revision_number=1,
            lock_version=0,
            scene_count=1,
        )
        revision = self._revision(project_id, user_id, 1, document, "project created")
        await self.repository.add(project, revision)
        await self._record_asset_references(revision, document)
        await self.uow.commit()
        return ProjectDetail(self._summary(project), document)

    async def get_project(self, project_id: UUID, user_id: UUID) -> ProjectDetail:
        project = await self._get_owned(project_id, user_id)
        revision = await self.repository.get_latest_revision(
            project_id, user_id, project.current_revision_number
        )
        if revision is None:
            raise NotFoundError("PROJECT_NOT_FOUND", "errors.projectNotFound")
        return ProjectDetail(self._summary(project), revision.document)

    async def save_revision(
        self,
        project_id: UUID,
        user_id: UUID,
        expected_lock_version: int,
        document: dict[str, Any],
        change_summary: str | None,
    ) -> ProjectDetail:
        project = await self._get_owned(project_id, user_id)
        self._validate_document(document, project_id)
        next_revision = project.current_revision_number + 1
        scene_count = len(document["scenes"])
        estimated_duration = self._estimated_duration(document)
        updated = await self.repository.advance_if_version(
            project_id,
            user_id,
            expected_lock_version,
            revision_number=next_revision,
            scene_count=scene_count,
            estimated_duration_ms=estimated_duration,
        )
        if updated is None:
            await self.uow.rollback()
            raise ConflictError("PROJECT_CONFLICT", "errors.projectConflict")
        revision = self._revision(
            project_id, user_id, next_revision, document, change_summary or "auto save"
        )
        await self.repository.add_revision(revision)
        await self._record_asset_references(revision, document)
        refreshed = await self.repository.set_thumbnail(
            project_id, user_id, project_thumbnail_asset_id(document)
        )
        if refreshed is not None:
            updated = refreshed
        await self.uow.commit()
        return ProjectDetail(self._summary(updated), document)

    async def update_project(
        self, project_id: UUID, user_id: UUID, *, name: str | None, status: str | None
    ) -> ProjectSummary:
        project = await self._get_owned(project_id, user_id)
        if name is not None:
            project.name = name
        if status is not None:
            project.status = status
        await self.uow.commit()
        return self._summary(project)

    async def duplicate_project(self, project_id: UUID, user_id: UUID) -> ProjectDetail:
        source = await self.get_project(project_id, user_id)
        new_id = uuid4()
        name = f"{source.project.name} copy"
        document = deepcopy(source.document)
        document["project_id"] = str(new_id)
        document["name"] = name
        project = Project(
            id=new_id,
            user_id=user_id,
            name=name,
            content_locale=source.project.content_locale,
            current_revision_number=1,
            lock_version=0,
            scene_count=len(document["scenes"]),
            estimated_duration_ms=self._estimated_duration(document),
        )
        revision = self._revision(new_id, user_id, 1, document, "project duplicated")
        await self.repository.add(project, revision)
        await self._record_asset_references(revision, document)
        project.thumbnail_asset_id = project_thumbnail_asset_id(document)
        await self.uow.commit()
        return ProjectDetail(self._summary(project), document)

    async def delete_project(self, project_id: UUID, user_id: UUID) -> None:
        if not await self.repository.soft_delete(project_id, user_id):
            raise NotFoundError("PROJECT_NOT_FOUND", "errors.projectNotFound")
        await self.uow.commit()

    async def _get_owned(self, project_id: UUID, user_id: UUID) -> Project:
        project = await self.repository.get_owned(project_id, user_id)
        if project is None:
            raise NotFoundError("PROJECT_NOT_FOUND", "errors.projectNotFound")
        return project

    def _validate_document(self, document: dict[str, Any], project_id: UUID) -> None:
        errors = sorted(self.validator.iter_errors(document), key=lambda error: list(error.path))
        if errors or document.get("project_id") != str(project_id):
            raise ConflictError("PROJECT_DOCUMENT_INVALID", "errors.projectDocumentInvalid")

    async def _record_asset_references(
        self, revision: ProjectRevision, document: dict[str, Any]
    ) -> None:
        extracted: list[tuple[UUID, str, str]] = []
        for scene_index, scene in enumerate(document["scenes"]):
            background = scene["background"]
            if background["type"] == "asset":
                extracted.append(
                    (
                        UUID(background["asset_id"]),
                        "background",
                        f"/scenes/{scene_index}/background/asset_id",
                    )
                )
            for layer_index, layer in enumerate(scene["layers"]):
                if layer["type"] == "image":
                    extracted.append(
                        (
                            UUID(layer["asset_id"]),
                            "layer",
                            f"/scenes/{scene_index}/layers/{layer_index}/asset_id",
                        )
                    )
        for track_index, track in enumerate(document.get("audio_tracks", [])):
            extracted.append(
                (
                    UUID(track["asset_id"]),
                    track["role"],
                    f"/audio_tracks/{track_index}/asset_id",
                )
            )
        asset_ids = {asset_id for asset_id, _, _ in extracted}
        await self.asset_service.assert_references_available(revision.user_id, asset_ids)
        await self.repository.add_asset_references(
            [
                ProjectAsset(
                    id=uuid4(),
                    user_id=revision.user_id,
                    project_id=revision.project_id,
                    project_revision_id=revision.id,
                    asset_id=asset_id,
                    role=role,
                    reference_path=path,
                )
                for asset_id, role, path in extracted
            ]
        )

    @staticmethod
    def _estimated_duration(document: dict[str, Any]) -> int:
        maximum = max(5000, int(document.get("video", {}).get("duration_ms", 0)))
        for scene in document["scenes"]:
            dialogue_end = 0
            for dialogue in scene["dialogues"]:
                dialogue_end += int(
                    dialogue.get("duration_ms") or max(1500, len(dialogue["text"]) * 100)
                )
            maximum = max(maximum, dialogue_end)
            for layer in scene["layers"]:
                maximum = max(
                    maximum,
                    int(layer.get("start_ms", 0)),
                    int(layer.get("end_ms", 0)),
                    *(int(keyframe["time_ms"]) for keyframe in layer.get("keyframes", [])),
                )
        for track in document.get("audio_tracks", []):
            maximum = max(
                maximum,
                int(track.get("start_ms", 0)) + int(track.get("duration_ms", 0)),
            )
        for effect in document.get("camera_effects", []):
            maximum = max(maximum, int(effect["end_ms"]))
        return ((maximum + 4999) // 5000) * 5000

    @staticmethod
    def _revision(
        project_id: UUID,
        user_id: UUID,
        number: int,
        document: dict[str, Any],
        summary: str,
    ) -> ProjectRevision:
        return ProjectRevision(
            id=uuid4(),
            project_id=project_id,
            user_id=user_id,
            revision_number=number,
            schema_version=int(document["schema_version"]),
            document=document,
            document_sha256=canonical_document_hash(document),
            change_summary=summary,
        )

    @staticmethod
    def _summary(project: Project, thumbnail_asset_id: UUID | None = None) -> ProjectSummary:
        return ProjectSummary(
            id=project.id,
            name=project.name,
            status=project.status,
            content_locale=project.content_locale,
            current_revision_number=project.current_revision_number,
            lock_version=project.lock_version,
            scene_count=project.scene_count,
            estimated_duration_ms=project.estimated_duration_ms,
            thumbnail_asset_id=project.thumbnail_asset_id or thumbnail_asset_id,
            updated_at=project.updated_at,
        )


def project_thumbnail_asset_id(document: dict[str, Any]) -> UUID | None:
    for scene in document.get("scenes", []):
        background = scene.get("background", {})
        if background.get("type") == "asset" and background.get("asset_id"):
            return UUID(background["asset_id"])
        for layer in scene.get("layers", []):
            if layer.get("type") == "image" and layer.get("asset_id"):
                return UUID(layer["asset_id"])
    return None
