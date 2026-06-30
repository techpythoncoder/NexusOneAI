from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from notification_service.core.database import get_db
from notification_service.core.deps import RequestContext, get_request_context
from notification_service.schemas.notification import (
    MarkReadRequest,
    PaginatedNotificationResponse,
)
from notification_service.services import notification_service

router = APIRouter(prefix="/api/v1/notifications", tags=["notifications"])


@router.get("/", response_model=PaginatedNotificationResponse)
async def list_notifications(
    unread_only: bool = Query(False),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    ctx: RequestContext = Depends(get_request_context),
    db: AsyncSession = Depends(get_db),
):
    total = await notification_service.count_notifications(
        db, ctx.user_id, ctx.org_id, unread_only=unread_only
    )
    items = await notification_service.list_notifications(
        db, ctx.user_id, ctx.org_id, unread_only=unread_only, page=page, page_size=page_size
    )
    total_pages = max(1, -(-total // page_size))  # ceiling division
    return PaginatedNotificationResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
        has_next=page < total_pages,
        has_prev=page > 1,
    )


@router.get("/count")
async def unread_count(
    ctx: RequestContext = Depends(get_request_context),
    db: AsyncSession = Depends(get_db),
):
    count = await notification_service.get_unread_count(db, ctx.user_id, ctx.org_id)
    return {"unread_count": count}


@router.post("/read")
async def mark_read(
    body: MarkReadRequest,
    ctx: RequestContext = Depends(get_request_context),
    db: AsyncSession = Depends(get_db),
):
    updated = await notification_service.mark_read(db, body.notification_ids, ctx.user_id)
    return {"updated": updated}


@router.post("/read/all")
async def mark_all_read(
    ctx: RequestContext = Depends(get_request_context),
    db: AsyncSession = Depends(get_db),
):
    updated = await notification_service.mark_all_read(db, ctx.user_id, ctx.org_id)
    return {"updated": updated}
