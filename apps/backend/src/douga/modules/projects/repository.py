from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import Select, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from douga.modules.projects.models import Project, ProjectAsset, ProjectRevision


class ProjectRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    def _owned(self, user_id: UUID) -> Select[tuple[Project]]:
        return select(Project).where(Project.user_id == user_id, Project.deleted_at.is_(None))

    async def list_owned(
        self,
        user_id: UUID,
        *,
        search: str | None,
        status: str | None,
        limit: int,
        offset: int,
    ) -> tuple[list[Project], int]:
        statement = self._owned(user_id)
        if search:
            statement = statement.where(Project.name.ilike(f"%{search}%"))
        if status:
            statement = statement.where(Project.status == status)
        count_statement = select(func.count()).select_from(statement.subquery())
        total = int((await self.session.scalar(count_statement)) or 0)
        result = await self.session.scalars(
            statement.order_by(Project.updated_at.desc()).limit(limit).offset(offset)
        )
        return list(result), total

    async def get_owned(self, project_id: UUID, user_id: UUID) -> Project | None:
        return (
            await self.session.scalars(self._owned(user_id).where(Project.id == project_id))
        ).one_or_none()

    async def get_latest_revision(
        self, project_id: UUID, user_id: UUID, revision_number: int
    ) -> ProjectRevision | None:
        statement = select(ProjectRevision).where(
            ProjectRevision.project_id == project_id,
            ProjectRevision.user_id == user_id,
            ProjectRevision.revision_number == revision_number,
        )
        return (await self.session.scalars(statement)).one_or_none()

    async def add(self, project: Project, revision: ProjectRevision) -> None:
        self.session.add_all((project, revision))
        await self.session.flush()

    async def add_revision(self, revision: ProjectRevision) -> None:
        self.session.add(revision)
        await self.session.flush()

    async def add_asset_references(self, references: list[ProjectAsset]) -> None:
        self.session.add_all(references)
        await self.session.flush()

    async def advance_if_version(
        self,
        project_id: UUID,
        user_id: UUID,
        expected_lock_version: int,
        *,
        revision_number: int,
        scene_count: int,
        estimated_duration_ms: int,
    ) -> Project | None:
        statement = (
            update(Project)
            .where(
                Project.id == project_id,
                Project.user_id == user_id,
                Project.deleted_at.is_(None),
                Project.lock_version == expected_lock_version,
            )
            .values(
                current_revision_number=revision_number,
                lock_version=Project.lock_version + 1,
                scene_count=scene_count,
                estimated_duration_ms=estimated_duration_ms,
                status="editing",
                updated_at=datetime.now(UTC),
            )
            .returning(Project)
        )
        return (await self.session.scalars(statement)).one_or_none()

    async def soft_delete(self, project_id: UUID, user_id: UUID) -> bool:
        result = await self.session.scalars(
            update(Project)
            .where(
                Project.id == project_id,
                Project.user_id == user_id,
                Project.deleted_at.is_(None),
            )
            .values(deleted_at=datetime.now(UTC), updated_at=datetime.now(UTC))
            .returning(Project.id)
        )
        return result.one_or_none() is not None
