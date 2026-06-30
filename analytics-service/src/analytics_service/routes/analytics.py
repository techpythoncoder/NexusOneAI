from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from analytics_service.core.database import get_db
from analytics_service.core.deps import RequestContext, get_request_context
from analytics_service.models.event import AnalyticsEvent

router = APIRouter(prefix="/api/v1/analytics", tags=["analytics"])


import uuid

@router.get("/summary")
async def summary(
    days: int = Query(30, ge=1, le=365),
    user_id: uuid.UUID | None = None,
    ctx: RequestContext = Depends(get_request_context),
    db: AsyncSession = Depends(get_db),
):
    since = datetime.now(timezone.utc) - timedelta(days=days)
    q = select(AnalyticsEvent.event_type, func.count().label("count")).where(
        AnalyticsEvent.organization_id == ctx.org_id,
        AnalyticsEvent.occurred_at >= since
    )
    if user_id:
        q = q.where(AnalyticsEvent.user_id == user_id)
        
    result = await db.execute(
        q.group_by(AnalyticsEvent.event_type)
        .order_by(func.count().desc())
    )
    return {"period_days": days, "events": [{"type": row.event_type, "count": row.count} for row in result]}


@router.get("/events")
async def list_events(
    event_type: str | None = None,
    days: int = Query(7, ge=1, le=90),
    skip: int = 0,
    limit: int = Query(100, le=500),
    ctx: RequestContext = Depends(get_request_context),
    db: AsyncSession = Depends(get_db),
):
    since = datetime.now(timezone.utc) - timedelta(days=days)
    q = select(AnalyticsEvent).where(AnalyticsEvent.organization_id == ctx.org_id, AnalyticsEvent.occurred_at >= since)
    if event_type:
        q = q.where(AnalyticsEvent.event_type == event_type)
    result = await db.execute(q.order_by(AnalyticsEvent.occurred_at.desc()).offset(skip).limit(limit))
    events = result.scalars().all()
    return [{"id": str(e.id), "event_type": e.event_type, "resource_type": e.resource_type, "properties": e.properties, "occurred_at": e.occurred_at.isoformat()} for e in events]
