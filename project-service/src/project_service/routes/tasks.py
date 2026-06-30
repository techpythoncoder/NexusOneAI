"""
Task routes — nested under /api/v1/projects/{project_id}/tasks/.

All routes read user identity from X-User-ID / X-Org-ID headers injected
by nginx — no JWT libraries, no token parsing.
"""

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from project_service.core.database import get_db
from project_service.core.deps import RequestContext, get_request_context
from project_service.core.kafka import publish_project_event
from project_service.models.task import TaskStatus
from project_service.schemas.task import TaskCreate, TaskResponse, TaskUpdate
from project_service.core import search as search_index
from project_service.services import task_service

router = APIRouter(
    prefix="/api/v1/projects/{project_id}/tasks",
    tags=["tasks"],
)


@router.post("", response_model=TaskResponse, status_code=201)
async def create_task(
    project_id: uuid.UUID,
    body: TaskCreate,
    ctx: RequestContext = Depends(get_request_context),
    db: AsyncSession = Depends(get_db),
):
    task = await task_service.create_task(db, project_id, ctx.org_id, body, ctx.user_id)
    await publish_project_event("task.created", {
        "task_id": str(task.id),
        "project_id": str(project_id),
        "organization_id": str(ctx.org_id),
        "task_number": task.task_number,
        "title": task.title,
        "reporter_id": str(ctx.user_id),
        "reporter_email": ctx.user_email,
        "assignee_id": str(task.assignee_id) if task.assignee_id else None,
        "assignee_email": body.assignee_email if body.assignee_email else None,
    })
    search_index.index_task(str(task.id), str(project_id), str(ctx.org_id), task.title, task.description, str(task.status.value) if task.status else None, str(task.priority.value) if task.priority else None)
    return task


@router.get("", response_model=list[TaskResponse])
async def list_tasks(
    project_id: uuid.UUID,
    status: TaskStatus | None = Query(default=None),
    assignee_id: uuid.UUID | None = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    ctx: RequestContext = Depends(get_request_context),
    db: AsyncSession = Depends(get_db),
):
    return await task_service.list_tasks(
        db, project_id, ctx.org_id,
        status=status, assignee_id=assignee_id,
        skip=skip, limit=limit,
    )


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(
    project_id: uuid.UUID,
    task_id: uuid.UUID,
    ctx: RequestContext = Depends(get_request_context),
    db: AsyncSession = Depends(get_db),
):
    return await task_service.get_task_or_404(db, task_id, ctx.org_id)


@router.patch("/{task_id}", response_model=TaskResponse)
async def update_task(
    project_id: uuid.UUID,
    task_id: uuid.UUID,
    body: TaskUpdate,
    ctx: RequestContext = Depends(get_request_context),
    db: AsyncSession = Depends(get_db),
):
    task = await task_service.update_task(db, task_id, ctx.org_id, body)
    search_index.index_task(str(task.id), str(project_id), str(ctx.org_id), task.title, task.description, str(task.status.value) if task.status else None, str(task.priority.value) if task.priority else None)

    # Publish relevant events based on what changed
    if body.status is not None:
        if body.status == TaskStatus.DONE:
            await publish_project_event("task.completed", {
                "task_id": str(task.id),
                "project_id": str(project_id),
                "organization_id": str(ctx.org_id),
                "task_number": task.task_number,
                "completed_by": str(ctx.user_id),
                "completed_at": task.completed_at.isoformat() if task.completed_at else None,
                "reporter_id": str(task.reporter_id) if task.reporter_id else None,
                "task_title": task.title,
            })
        else:
            await publish_project_event("task.updated", {
                "task_id": str(task.id),
                "project_id": str(project_id),
                "organization_id": str(ctx.org_id),
                "updated_by": str(ctx.user_id),
                "new_status": body.status.value,
            })
    elif body.assignee_id is not None:
        await publish_project_event("task.assigned", {
            "task_id": str(task.id),
            "project_id": str(project_id),
            "organization_id": str(ctx.org_id),
            "assignee_id": str(body.assignee_id),
            "assignee_email": body.assignee_email,
            "assigned_by": str(ctx.user_id),
            "task_title": task.title,
        })
    else:
        await publish_project_event("task.updated", {
            "task_id": str(task.id),
            "project_id": str(project_id),
            "organization_id": str(ctx.org_id),
            "updated_by": str(ctx.user_id),
        })

    return task


@router.delete("/{task_id}", status_code=204)
async def delete_task(
    project_id: uuid.UUID,
    task_id: uuid.UUID,
    ctx: RequestContext = Depends(get_request_context),
    db: AsyncSession = Depends(get_db),
):
    await task_service.delete_task(db, task_id, ctx.org_id)
    search_index.delete_from_index("tasks", str(task_id), str(ctx.org_id))
