"""
Project and milestone service — all DB operations filter by organization_id
for strict multi-tenant isolation.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from project_service.core.exceptions import ConflictError, NotFoundError
from project_service.models.milestone import Milestone
from project_service.models.project import Project, ProjectStatus
from project_service.schemas.project import MilestoneCreate, ProjectCreate, ProjectUpdate


async def create_project(
    db: AsyncSession,
    data: ProjectCreate,
    org_id: uuid.UUID,
    user_id: uuid.UUID,
) -> Project:
    """Create a new project. Key must be unique within the organisation."""
    # Validate key uniqueness within the org
    existing = await db.execute(
        select(Project).where(
            Project.organization_id == org_id,
            Project.key == data.key.upper(),
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise ConflictError(f"A project with key '{data.key.upper()}' already exists in this organisation")

    project = Project(
        organization_id=org_id,
        name=data.name,
        key=data.key.upper(),
        description=data.description,
        priority=data.priority,
        start_date=data.start_date,
        due_date=data.due_date,
        owner_id=user_id,
        created_by=user_id,
        settings={},
    )
    db.add(project)
    await db.flush()
    await db.refresh(project)
    return project


async def get_project_or_404(
    db: AsyncSession,
    project_id: uuid.UUID,
    org_id: uuid.UUID,
) -> Project:
    """Fetch a project by ID, scoped to the organisation. Raises 404 if not found."""
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.organization_id == org_id,
        )
    )
    project = result.scalar_one_or_none()
    if project is None:
        raise NotFoundError(f"Project '{project_id}' not found")
    return project


async def list_projects(
    db: AsyncSession,
    org_id: uuid.UUID,
    status: ProjectStatus | None = None,
    skip: int = 0,
    limit: int = 50,
) -> list[Project]:
    """List all projects for an organisation, with optional status filter."""
    query = select(Project).where(
        Project.organization_id == org_id,
        Project.is_archived.is_(False),
    )
    if status is not None:
        query = query.where(Project.status == status)
    query = query.order_by(Project.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    return list(result.scalars().all())


async def update_project(
    db: AsyncSession,
    project_id: uuid.UUID,
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    data: ProjectUpdate,
) -> Project:
    """Apply a partial update to a project."""
    project = await get_project_or_404(db, project_id, org_id)
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(project, field, value)
    await db.flush()
    await db.refresh(project)
    return project


async def archive_project(
    db: AsyncSession,
    project_id: uuid.UUID,
    org_id: uuid.UUID,
    user_id: uuid.UUID,
) -> Project:
    """Soft-delete a project by marking it archived."""
    project = await get_project_or_404(db, project_id, org_id)
    project.is_archived = True
    project.status = ProjectStatus.ARCHIVED
    await db.flush()
    await db.refresh(project)
    return project


# ── Milestones ────────────────────────────────────────────────────────────────

async def create_milestone(
    db: AsyncSession,
    project_id: uuid.UUID,
    org_id: uuid.UUID,
    data: MilestoneCreate,
    user_id: uuid.UUID,
) -> Milestone:
    """Create a milestone for a project."""
    # Ensure the project exists and belongs to this org
    await get_project_or_404(db, project_id, org_id)

    milestone = Milestone(
        organization_id=org_id,
        project_id=project_id,
        name=data.name,
        description=data.description,
        due_date=data.due_date,
    )
    db.add(milestone)
    await db.flush()
    await db.refresh(milestone)
    return milestone


async def list_milestones(
    db: AsyncSession,
    project_id: uuid.UUID,
    org_id: uuid.UUID,
) -> list[Milestone]:
    """Return all milestones for a project, scoped to the organisation."""
    result = await db.execute(
        select(Milestone).where(
            Milestone.project_id == project_id,
            Milestone.organization_id == org_id,
        ).order_by(Milestone.created_at.asc())
    )
    return list(result.scalars().all())


async def complete_milestone(
    db: AsyncSession,
    milestone_id: uuid.UUID,
    org_id: uuid.UUID,
) -> Milestone:
    """Mark a milestone as completed."""
    result = await db.execute(
        select(Milestone).where(
            Milestone.id == milestone_id,
            Milestone.organization_id == org_id,
        )
    )
    milestone = result.scalar_one_or_none()
    if milestone is None:
        raise NotFoundError(f"Milestone '{milestone_id}' not found")

    milestone.is_completed = True
    milestone.completed_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(milestone)
    return milestone
