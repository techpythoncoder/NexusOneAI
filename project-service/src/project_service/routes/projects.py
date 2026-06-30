"""
Project routes.

All routes read user identity from X-User-ID / X-Org-ID headers injected
by nginx — no JWT libraries, no token parsing.
"""

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from project_service.core.database import get_db
from project_service.core.deps import RequestContext, get_request_context
from project_service.core.kafka import publish_project_event
from project_service.models.project import ProjectStatus
from project_service.schemas.project import (
    MilestoneCreate,
    MilestoneResponse,
    ProjectCreate,
    ProjectResponse,
    ProjectUpdate,
)
from project_service.core import search as search_index
from project_service.services import project_service

router = APIRouter(prefix="/api/v1/projects", tags=["projects"])


# ── CRUD ──────────────────────────────────────────────────────────────────────

@router.post("/", response_model=ProjectResponse, status_code=201)
async def create_project(
    body: ProjectCreate,
    ctx: RequestContext = Depends(get_request_context),
    db: AsyncSession = Depends(get_db),
):
    project = await project_service.create_project(db, body, ctx.org_id, ctx.user_id)
    await publish_project_event("project.created", {
        "project_id": str(project.id),
        "organization_id": str(project.organization_id),
        "name": project.name,
        "key": project.key,
        "owner_id": str(ctx.user_id),
    })
    search_index.index_project(str(project.id), str(ctx.org_id), project.name, project.description)
    return project


@router.get("/", response_model=list[ProjectResponse])
async def list_projects(
    status: ProjectStatus | None = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    ctx: RequestContext = Depends(get_request_context),
    db: AsyncSession = Depends(get_db),
):
    return await project_service.list_projects(db, ctx.org_id, status=status, skip=skip, limit=limit)


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: uuid.UUID,
    ctx: RequestContext = Depends(get_request_context),
    db: AsyncSession = Depends(get_db),
):
    return await project_service.get_project_or_404(db, project_id, ctx.org_id)


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: uuid.UUID,
    body: ProjectUpdate,
    ctx: RequestContext = Depends(get_request_context),
    db: AsyncSession = Depends(get_db),
):
    project = await project_service.update_project(db, project_id, ctx.org_id, ctx.user_id, body)
    search_index.index_project(str(project.id), str(ctx.org_id), project.name, project.description)
    return project


@router.delete("/{project_id}", response_model=ProjectResponse)
async def archive_project(
    project_id: uuid.UUID,
    ctx: RequestContext = Depends(get_request_context),
    db: AsyncSession = Depends(get_db),
):
    project = await project_service.archive_project(db, project_id, ctx.org_id, ctx.user_id)
    await publish_project_event("project.archived", {
        "project_id": str(project.id),
        "organization_id": str(project.organization_id),
        "archived_by": str(ctx.user_id),
    })
    search_index.delete_from_index("projects", str(project_id), str(ctx.org_id))
    return project


# ── Milestones ────────────────────────────────────────────────────────────────

@router.post("/{project_id}/milestones", response_model=MilestoneResponse, status_code=201)
async def create_milestone(
    project_id: uuid.UUID,
    body: MilestoneCreate,
    ctx: RequestContext = Depends(get_request_context),
    db: AsyncSession = Depends(get_db),
):
    return await project_service.create_milestone(db, project_id, ctx.org_id, body, ctx.user_id)


@router.get("/{project_id}/milestones", response_model=list[MilestoneResponse])
async def list_milestones(
    project_id: uuid.UUID,
    ctx: RequestContext = Depends(get_request_context),
    db: AsyncSession = Depends(get_db),
):
    return await project_service.list_milestones(db, project_id, ctx.org_id)


@router.patch(
    "/{project_id}/milestones/{milestone_id}/complete",
    response_model=MilestoneResponse,
)
async def complete_milestone(
    project_id: uuid.UUID,
    milestone_id: uuid.UUID,
    ctx: RequestContext = Depends(get_request_context),
    db: AsyncSession = Depends(get_db),
):
    return await project_service.complete_milestone(db, milestone_id, ctx.org_id)
