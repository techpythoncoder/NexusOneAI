from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from audit_service.core.database import get_db
from audit_service.core.deps import RequestContext, get_request_context
from audit_service.models.audit_log import AuditLog

router = APIRouter(prefix="/api/v1/audit", tags=["audit"])


@router.get("/logs")
async def list_audit_logs(
    action: str | None = None,
    resource_type: str | None = None,
    actor_id: str | None = None,
    days: int = Query(30, ge=1, le=365),
    skip: int = 0,
    limit: int = Query(100, le=1000),
    ctx: RequestContext = Depends(get_request_context),
    db: AsyncSession = Depends(get_db),
):
    since = datetime.now(timezone.utc) - timedelta(days=days)
    q = select(AuditLog).where(AuditLog.organization_id == ctx.org_id, AuditLog.occurred_at >= since)
    if action:
        q = q.where(AuditLog.action == action)
    if resource_type:
        q = q.where(AuditLog.resource_type == resource_type)
    if actor_id:
        import uuid
        q = q.where(AuditLog.actor_id == uuid.UUID(actor_id))
    result = await db.execute(q.order_by(AuditLog.occurred_at.desc()).offset(skip).limit(limit))
    logs = result.scalars().all()
    return [{"id": str(l.id), "action": l.action, "actor_id": str(l.actor_id) if l.actor_id else None, "actor_email": l.actor_email, "resource_type": l.resource_type, "resource_id": l.resource_id, "source_service": l.source_service, "payload": l.payload, "occurred_at": l.occurred_at.isoformat()} for l in logs]
