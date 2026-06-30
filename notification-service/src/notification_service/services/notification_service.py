import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from notification_service.models.notification import Notification, NotificationType


async def create_notification(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    notification_type: NotificationType,
    title: str,
    body: str,
    org_id: uuid.UUID | None = None,
    action_url: str | None = None,
    metadata: dict | None = None,
) -> Notification:
    notif = Notification(
        organization_id=org_id,
        user_id=user_id,
        notification_type=notification_type,
        title=title,
        body=body,
        action_url=action_url,
        metadata_=metadata or {},
    )
    db.add(notif)
    await db.flush()
    return notif


async def count_notifications(
    db: AsyncSession,
    user_id: uuid.UUID,
    org_id: uuid.UUID | None = None,
    unread_only: bool = False,
) -> int:
    q = select(func.count()).select_from(Notification).where(Notification.user_id == user_id)
    if org_id:
        q = q.where(Notification.organization_id == org_id)
    if unread_only:
        q = q.where(Notification.is_read == False)  # noqa: E712
    result = await db.execute(q)
    return result.scalar() or 0


async def list_notifications(
    db: AsyncSession,
    user_id: uuid.UUID,
    org_id: uuid.UUID | None = None,
    unread_only: bool = False,
    page: int = 1,
    page_size: int = 20,
) -> list[Notification]:
    skip = (page - 1) * page_size
    q = select(Notification).where(Notification.user_id == user_id)
    if org_id:
        q = q.where(Notification.organization_id == org_id)
    if unread_only:
        q = q.where(Notification.is_read == False)  # noqa: E712
    q = q.order_by(Notification.created_at.desc()).offset(skip).limit(page_size)
    result = await db.execute(q)
    return list(result.scalars().all())


async def mark_all_read(
    db: AsyncSession, user_id: uuid.UUID, org_id: uuid.UUID | None = None
) -> int:
    q = (
        update(Notification)
        .where(Notification.user_id == user_id, Notification.is_read == False)  # noqa: E712
    )
    if org_id:
        q = q.where(Notification.organization_id == org_id)
    result = await db.execute(q.values(is_read=True, read_at=datetime.now(timezone.utc)))
    return result.rowcount


async def mark_read(
    db: AsyncSession, notification_ids: list[uuid.UUID], user_id: uuid.UUID
) -> int:
    result = await db.execute(
        update(Notification)
        .where(Notification.id.in_(notification_ids), Notification.user_id == user_id)
        .values(is_read=True, read_at=datetime.now(timezone.utc))
    )
    return result.rowcount


async def get_unread_count(db: AsyncSession, user_id: uuid.UUID, org_id: uuid.UUID | None = None) -> int:
    q = select(func.count()).select_from(Notification).where(
        Notification.user_id == user_id,
        Notification.is_read == False,  # noqa: E712
    )
    if org_id:
        q = q.where(Notification.organization_id == org_id)
    result = await db.execute(q)
    return result.scalar() or 0
