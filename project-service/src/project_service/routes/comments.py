"""
Comment routes — nested under /api/v1/projects/{project_id}/tasks/{task_id}/comments/.

All routes read user identity from X-User-ID / X-Org-ID headers injected
by nginx — no JWT libraries, no token parsing.
"""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from project_service.core.database import get_db
from project_service.core.deps import RequestContext, get_request_context
from project_service.core.kafka import publish_project_event
from project_service.core import search as search_index
from project_service.schemas.comment import CommentCreate, CommentResponse, CommentUpdate
from project_service.services import task_service

router = APIRouter(
    prefix="/api/v1/projects/{project_id}/tasks/{task_id}/comments",
    tags=["comments"],
)


@router.post("", response_model=CommentResponse, status_code=201)
async def add_comment(
    project_id: uuid.UUID,
    task_id: uuid.UUID,
    body: CommentCreate,
    ctx: RequestContext = Depends(get_request_context),
    db: AsyncSession = Depends(get_db),
):
    comment = await task_service.add_comment(db, task_id, ctx.org_id, ctx.user_id, body.content, body.parent_id)
    
    # Fetch task to get task title
    task = await task_service.get_task_or_404(db, task_id, ctx.org_id)
    
    # Extract author name from email prefix
    author_name = ctx.user_email.split("@")[0].capitalize() if ctx.user_email else "Someone"
    
    # Publish Kafka event for mentions
    await publish_project_event("comment.created", {
        "comment_id": str(comment.id),
        "task_id": str(task_id),
        "project_id": str(project_id),
        "organization_id": str(ctx.org_id),
        "author_id": str(ctx.user_id),
        "author_name": author_name,
        "task_title": task.title,
        "content": comment.content,
        "parent_id": str(comment.parent_id) if comment.parent_id else None,
        "mentioned_emails": body.mentioned_emails,
        "mentioned_user_ids": [str(uid) for uid in body.mentioned_user_ids],
    })
    search_index.index_comment(str(comment.id), str(task_id), str(project_id), str(ctx.org_id), comment.content, ctx.user_email)
    return comment


@router.get("", response_model=list[CommentResponse])
async def list_comments(
    project_id: uuid.UUID,
    task_id: uuid.UUID,
    ctx: RequestContext = Depends(get_request_context),
    db: AsyncSession = Depends(get_db),
):
    return await task_service.list_comments(db, task_id, ctx.org_id)


@router.patch("/{comment_id}", response_model=CommentResponse)
async def update_comment(
    project_id: uuid.UUID,
    task_id: uuid.UUID,
    comment_id: uuid.UUID,
    body: CommentUpdate,
    ctx: RequestContext = Depends(get_request_context),
    db: AsyncSession = Depends(get_db),
):
    comment = await task_service.update_comment(db, comment_id, ctx.org_id, ctx.user_id, body.content)
    search_index.index_comment(str(comment.id), str(task_id), str(project_id), str(ctx.org_id), comment.content, ctx.user_email)
    return comment


@router.delete("/{comment_id}", status_code=204)
async def delete_comment(
    project_id: uuid.UUID,
    task_id: uuid.UUID,
    comment_id: uuid.UUID,
    ctx: RequestContext = Depends(get_request_context),
    db: AsyncSession = Depends(get_db),
):
    await task_service.delete_comment(db, comment_id, ctx.org_id, ctx.user_id)
    search_index.delete_from_index("comments", str(comment_id), str(ctx.org_id))
