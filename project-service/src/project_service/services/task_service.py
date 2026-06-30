"""
Task and comment service — all DB operations filter by organization_id
for strict multi-tenant isolation.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from project_service.core.exceptions import ForbiddenError, NotFoundError
from project_service.models.comment import Comment
from project_service.models.task import Task, TaskStatus
from project_service.schemas.task import TaskCreate, TaskUpdate


async def _next_task_number(db: AsyncSession, project_id: uuid.UUID) -> int:
    """Return the next sequential task number for the given project."""
    result = await db.execute(
        select(func.coalesce(func.max(Task.task_number), 0)).where(
            Task.project_id == project_id
        )
    )
    current_max: int = result.scalar_one()
    return current_max + 1


async def create_task(
    db: AsyncSession,
    project_id: uuid.UUID,
    org_id: uuid.UUID,
    data: TaskCreate,
    user_id: uuid.UUID,
) -> Task:
    """Create a new task with an auto-incrementing task_number within the project."""
    task_number = await _next_task_number(db, project_id)

    task = Task(
        organization_id=org_id,
        project_id=project_id,
        task_number=task_number,
        title=data.title,
        description=data.description,
        status=data.status,
        priority=data.priority,
        assignee_id=data.assignee_id,
        reporter_id=user_id,
        parent_task_id=data.parent_task_id,
        estimated_hours=data.estimated_hours,
        due_date=data.due_date,
    )
    db.add(task)
    await db.flush()
    await db.refresh(task)
    return task


async def get_task_or_404(
    db: AsyncSession,
    task_id: uuid.UUID,
    org_id: uuid.UUID,
) -> Task:
    """Fetch a task by ID scoped to the organisation. Raises 404 if not found."""
    result = await db.execute(
        select(Task).where(
            Task.id == task_id,
            Task.organization_id == org_id,
        )
    )
    task = result.scalar_one_or_none()
    if task is None:
        raise NotFoundError(f"Task '{task_id}' not found")
    return task


async def list_tasks(
    db: AsyncSession,
    project_id: uuid.UUID,
    org_id: uuid.UUID,
    status: TaskStatus | None = None,
    assignee_id: uuid.UUID | None = None,
    skip: int = 0,
    limit: int = 100,
) -> list[Task]:
    """List tasks for a project with optional status and assignee filters."""
    query = select(Task).where(
        Task.project_id == project_id,
        Task.organization_id == org_id,
    )
    if status is not None:
        query = query.where(Task.status == status)
    if assignee_id is not None:
        query = query.where(Task.assignee_id == assignee_id)
    query = query.order_by(Task.position.asc(), Task.created_at.asc()).offset(skip).limit(limit)
    result = await db.execute(query)
    return list(result.scalars().all())


async def update_task(
    db: AsyncSession,
    task_id: uuid.UUID,
    org_id: uuid.UUID,
    data: TaskUpdate,
) -> Task:
    """Apply a partial update to a task. Sets completed_at when status becomes DONE."""
    task = await get_task_or_404(db, task_id, org_id)
    update_data = data.model_dump(exclude_unset=True)

    for field, value in update_data.items():
        setattr(task, field, value)

    # Auto-set completed_at when transitioning to DONE
    if data.status == TaskStatus.DONE and task.completed_at is None:
        task.completed_at = datetime.now(timezone.utc)
    elif data.status is not None and data.status != TaskStatus.DONE:
        task.completed_at = None

    await db.flush()
    await db.refresh(task)
    return task


async def delete_task(
    db: AsyncSession,
    task_id: uuid.UUID,
    org_id: uuid.UUID,
) -> None:
    """Hard-delete a task and all its children (cascaded by DB)."""
    task = await get_task_or_404(db, task_id, org_id)
    await db.delete(task)
    await db.flush()


# ── Comments ──────────────────────────────────────────────────────────────────

async def add_comment(
    db: AsyncSession,
    task_id: uuid.UUID,
    org_id: uuid.UUID,
    author_id: uuid.UUID,
    content: str,
    parent_id: uuid.UUID | None = None,
) -> Comment:
    """Add a comment to a task."""
    # Verify the task exists and belongs to this org
    await get_task_or_404(db, task_id, org_id)

    comment = Comment(
        organization_id=org_id,
        task_id=task_id,
        author_id=author_id,
        content=content,
        parent_id=parent_id,
    )
    db.add(comment)
    await db.flush()
    await db.refresh(comment)
    return comment


async def list_comments(
    db: AsyncSession,
    task_id: uuid.UUID,
    org_id: uuid.UUID,
) -> list[Comment]:
    """Return all comments for a task, scoped to the organisation."""
    result = await db.execute(
        select(Comment).where(
            Comment.task_id == task_id,
            Comment.organization_id == org_id,
        ).order_by(Comment.created_at.asc())
    )
    return list(result.scalars().all())


async def update_comment(
    db: AsyncSession,
    comment_id: uuid.UUID,
    org_id: uuid.UUID,
    author_id: uuid.UUID,
    content: str,
) -> Comment:
    """Edit a comment. Only the original author may edit."""
    result = await db.execute(
        select(Comment).where(
            Comment.id == comment_id,
            Comment.organization_id == org_id,
        )
    )
    comment = result.scalar_one_or_none()
    if comment is None:
        raise NotFoundError(f"Comment '{comment_id}' not found")
    if comment.author_id != author_id:
        raise ForbiddenError("You can only edit your own comments")

    comment.content = content
    comment.is_edited = True
    await db.flush()
    await db.refresh(comment)
    return comment


async def delete_comment(
    db: AsyncSession,
    comment_id: uuid.UUID,
    org_id: uuid.UUID,
    author_id: uuid.UUID,
) -> None:
    """Delete a comment. Only the original author may delete."""
    result = await db.execute(
        select(Comment).where(
            Comment.id == comment_id,
            Comment.organization_id == org_id,
        )
    )
    comment = result.scalar_one_or_none()
    if comment is None:
        raise NotFoundError(f"Comment '{comment_id}' not found")
    if comment.author_id != author_id:
        raise ForbiddenError("You can only delete your own comments")

    await db.delete(comment)
    await db.flush()
