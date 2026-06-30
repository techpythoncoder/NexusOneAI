import json
import uuid
from datetime import datetime, timezone

import httpx
from aiokafka import AIOKafkaProducer
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from chat_service.core.config import settings
from chat_service.core.connection_manager import manager
from chat_service.core.database import AsyncSessionLocal, get_db
from chat_service.core.deps import RequestContext, get_request_context, get_ws_context
from chat_service.models.channel import Channel, ChannelLastRead, ChannelMember, ChannelType, Message

router = APIRouter(prefix="/api/v1/chat", tags=["chat"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class ChannelCreate(BaseModel):
    name: str
    description: str | None = None
    channel_type: ChannelType = ChannelType.PUBLIC


class AddMemberRequest(BaseModel):
    user_id: str
    user_email: str


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _assert_channel_access(db: AsyncSession, channel: Channel, user_id: uuid.UUID) -> None:
    """For private channels, verify the user is an explicit member."""
    if channel.channel_type != ChannelType.PRIVATE:
        return
    result = await db.execute(
        select(ChannelMember).where(
            ChannelMember.channel_id == channel.id,
            ChannelMember.user_id == user_id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this channel")


async def _unread_count(db: AsyncSession, channel_id: uuid.UUID, user_id: uuid.UUID) -> int:
    """Count messages in a channel since user's last read timestamp."""
    last_read_result = await db.execute(
        select(ChannelLastRead).where(
            ChannelLastRead.channel_id == channel_id,
            ChannelLastRead.user_id == user_id,
        )
    )
    last_read = last_read_result.scalar_one_or_none()
    if not last_read:
        count_result = await db.execute(
            select(func.count()).select_from(Message).where(Message.channel_id == channel_id)
        )
        return count_result.scalar() or 0

    count_result = await db.execute(
        select(func.count()).select_from(Message).where(
            Message.channel_id == channel_id,
            Message.created_at > last_read.last_read_at,
        )
    )
    return count_result.scalar() or 0


async def _mark_read(db: AsyncSession, channel_id: uuid.UUID, user_id: uuid.UUID) -> None:
    """Upsert the last-read timestamp for a user in a channel."""
    result = await db.execute(
        select(ChannelLastRead).where(
            ChannelLastRead.channel_id == channel_id,
            ChannelLastRead.user_id == user_id,
        )
    )
    record = result.scalar_one_or_none()
    if record:
        record.last_read_at = datetime.now(timezone.utc)
    else:
        db.add(ChannelLastRead(channel_id=channel_id, user_id=user_id))
    await db.flush()


async def _publish_message_event(channel: Channel, msg: Message, ctx: RequestContext) -> None:
    """Fire-and-forget Kafka event so notification service can fan out notifications."""
    try:
        # Fetch all active org members for notification fanout via internal service call
        notification_recipients: list[dict] = []
        try:
            import httpx
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(
                    f"http://nexus-org:8002/api/v1/orgs/{channel.organization_id}/members",
                    headers={
                        "X-User-ID": str(ctx.user_id),
                        "X-User-Email": ctx.user_email,
                        "X-User-Role": ctx.user_role or "member",
                        "X-Org-ID": str(channel.organization_id),
                    },
                )
                if resp.status_code == 200:
                    notification_recipients = [
                        {"user_id": m["user_id"], "user_email": m.get("user_email", "")}
                        for m in resp.json()
                        if m.get("user_id") != str(ctx.user_id) and m.get("status") == "active"
                    ]
        except Exception:
            pass  # Never block message delivery on member-fetch failure

        producer = AIOKafkaProducer(
            bootstrap_servers=settings.KAFKA_BOOTSTRAP_SERVERS,
            value_serializer=lambda v: json.dumps(v).encode(),
        )
        await producer.start()
        try:
            await producer.send_and_wait(
                "nexus.chat.events",
                {
                    "event_type": "chat.message.sent",
                    "payload": {
                        "channel_id": str(channel.id),
                        "channel_name": channel.name,
                        "channel_type": channel.channel_type.value,
                        "organization_id": str(channel.organization_id),
                        "sender_id": str(msg.sender_id),
                        "sender_email": msg.sender_email,
                        "content_preview": msg.content[:120],
                        "message_id": str(msg.id),
                        "created_at": msg.created_at.isoformat(),
                        "notification_recipients": notification_recipients,
                    },
                },
            )
        finally:
            await producer.stop()
    except Exception:
        pass  # Never block message delivery on Kafka failure


# ── REST: Channels ─────────────────────────────────────────────────────────────

@router.post("/channels", status_code=201)
async def create_channel(
    body: ChannelCreate,
    ctx: RequestContext = Depends(get_request_context),
    db: AsyncSession = Depends(get_db),
):
    channel = Channel(
        organization_id=ctx.org_id,
        name=body.name,
        description=body.description,
        channel_type=body.channel_type,
        created_by=ctx.user_id,
    )
    db.add(channel)
    await db.flush()

    # For private channels, auto-add creator as a member
    if body.channel_type == ChannelType.PRIVATE:
        db.add(ChannelMember(
            channel_id=channel.id,
            user_id=ctx.user_id,
            user_email=ctx.user_email,
            added_by=ctx.user_id,
        ))
        await db.flush()

    member_count = 1 if body.channel_type == ChannelType.PRIVATE else None
    return {
        "id": str(channel.id),
        "name": channel.name,
        "channel_type": channel.channel_type.value,
        "description": channel.description,
        "member_count": member_count,
        "unread_count": 0,
        "created_at": channel.created_at.isoformat(),
    }


@router.get("/channels")
async def list_channels(
    ctx: RequestContext = Depends(get_request_context),
    db: AsyncSession = Depends(get_db),
):
    # Fetch all non-archived channels for this org
    result = await db.execute(
        select(Channel).where(
            Channel.organization_id == ctx.org_id,
            Channel.is_archived == False,  # noqa: E712
        ).order_by(Channel.created_at)
    )
    channels = result.scalars().all()

    out = []
    for c in channels:
        # Private channels are only visible to explicit members
        if c.channel_type == ChannelType.PRIVATE:
            member_check = await db.execute(
                select(ChannelMember).where(
                    ChannelMember.channel_id == c.id,
                    ChannelMember.user_id == ctx.user_id,
                )
            )
            if not member_check.scalar_one_or_none():
                continue

        # Member count (only tracked for private channels)
        if c.channel_type == ChannelType.PRIVATE:
            count_res = await db.execute(
                select(func.count()).select_from(ChannelMember).where(ChannelMember.channel_id == c.id)
            )
            member_count = count_res.scalar() or 0
        else:
            member_count = None  # public = all org members

        unread = await _unread_count(db, c.id, ctx.user_id)

        out.append({
            "id": str(c.id),
            "name": c.name,
            "channel_type": c.channel_type.value,
            "description": c.description,
            "member_count": member_count,
            "unread_count": unread,
            "created_at": c.created_at.isoformat(),
        })
    return out


@router.get("/channels/unread-total")
async def total_unread(
    ctx: RequestContext = Depends(get_request_context),
    db: AsyncSession = Depends(get_db),
):
    """Total unread message count across all accessible channels — used for sidebar badge."""
    result = await db.execute(
        select(Channel).where(
            Channel.organization_id == ctx.org_id,
            Channel.is_archived == False,  # noqa: E712
        )
    )
    channels = result.scalars().all()
    total = 0
    for c in channels:
        if c.channel_type == ChannelType.PRIVATE:
            member_check = await db.execute(
                select(ChannelMember).where(
                    ChannelMember.channel_id == c.id,
                    ChannelMember.user_id == ctx.user_id,
                )
            )
            if not member_check.scalar_one_or_none():
                continue
        total += await _unread_count(db, c.id, ctx.user_id)
    return {"unread_count": total}


# ── REST: Messages ─────────────────────────────────────────────────────────────

@router.get("/channels/{channel_id}/messages")
async def get_messages(
    channel_id: uuid.UUID,
    limit: int = 50,
    ctx: RequestContext = Depends(get_request_context),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Channel).where(Channel.id == channel_id))
    channel = result.scalar_one_or_none()
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    await _assert_channel_access(db, channel, ctx.user_id)

    msgs_result = await db.execute(
        select(Message)
        .where(Message.channel_id == channel_id, Message.organization_id == ctx.org_id)
        .order_by(Message.created_at.desc())
        .limit(limit)
    )
    msgs = msgs_result.scalars().all()

    # Mark channel as read when messages are fetched
    await _mark_read(db, channel_id, ctx.user_id)

    return [
        {
            "id": str(m.id),
            "sender_id": str(m.sender_id),
            "sender_email": m.sender_email,
            "content": m.content,
            "created_at": m.created_at.isoformat(),
        }
        for m in reversed(msgs)
    ]


# ── REST: Channel Members ──────────────────────────────────────────────────────

@router.get("/channels/{channel_id}/members")
async def list_channel_members(
    channel_id: uuid.UUID,
    ctx: RequestContext = Depends(get_request_context),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Channel).where(Channel.id == channel_id))
    channel = result.scalar_one_or_none()
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    await _assert_channel_access(db, channel, ctx.user_id)

    members_result = await db.execute(
        select(ChannelMember).where(ChannelMember.channel_id == channel_id)
    )
    return [
        {
            "user_id": str(m.user_id),
            "user_email": m.user_email,
            "added_at": m.added_at.isoformat(),
        }
        for m in members_result.scalars().all()
    ]


@router.post("/channels/{channel_id}/members", status_code=201)
async def add_channel_member(
    channel_id: uuid.UUID,
    body: AddMemberRequest,
    ctx: RequestContext = Depends(get_request_context),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Channel).where(Channel.id == channel_id))
    channel = result.scalar_one_or_none()
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    if channel.channel_type != ChannelType.PRIVATE:
        raise HTTPException(status_code=400, detail="Only private channels have explicit members")
    if channel.created_by != ctx.user_id and ctx.user_role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Only the channel creator or org admin can add members")

    target_user_id = uuid.UUID(body.user_id)
    existing = await db.execute(
        select(ChannelMember).where(
            ChannelMember.channel_id == channel_id,
            ChannelMember.user_id == target_user_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="User is already a member")

    db.add(ChannelMember(
        channel_id=channel_id,
        user_id=target_user_id,
        user_email=body.user_email,
        added_by=ctx.user_id,
    ))
    return {"ok": True}


@router.delete("/channels/{channel_id}/members/{user_id}", status_code=204)
async def remove_channel_member(
    channel_id: uuid.UUID,
    user_id: uuid.UUID,
    ctx: RequestContext = Depends(get_request_context),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Channel).where(Channel.id == channel_id))
    channel = result.scalar_one_or_none()
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    if channel.created_by != ctx.user_id and ctx.user_role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Only the channel creator or org admin can remove members")

    member_result = await db.execute(
        select(ChannelMember).where(
            ChannelMember.channel_id == channel_id,
            ChannelMember.user_id == user_id,
        )
    )
    member = member_result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    await db.delete(member)


# ── WebSocket ──────────────────────────────────────────────────────────────────

@router.websocket("/channels/{channel_id}/ws")
async def websocket_endpoint(
    channel_id: str,
    ws: WebSocket,
    ctx: RequestContext = Depends(get_ws_context),
):
    # Validate channel access before accepting the connection
    async with AsyncSessionLocal() as db:
        ch_result = await db.execute(select(Channel).where(Channel.id == uuid.UUID(channel_id)))
        channel = ch_result.scalar_one_or_none()
        if not channel:
            await ws.close(code=4004)
            return
        if channel.channel_type == ChannelType.PRIVATE:
            member_check = await db.execute(
                select(ChannelMember).where(
                    ChannelMember.channel_id == channel.id,
                    ChannelMember.user_id == ctx.user_id,
                )
            )
            if not member_check.scalar_one_or_none():
                await ws.close(code=4003)
                return

    await manager.connect(channel_id, str(ctx.user_id), ws)
    try:
        while True:
            data = await ws.receive_json()
            msg_type = data.get("type", "message")
            
            if msg_type == "rtc-signal":
                data["sender_id"] = str(ctx.user_id)
                data["sender_email"] = ctx.user_email
                await manager.broadcast(channel_id, data)
                continue
                
            content = data.get("content", "").strip()
            if not content:
                continue

            async with AsyncSessionLocal() as db:
                ch_result = await db.execute(select(Channel).where(Channel.id == uuid.UUID(channel_id)))
                channel = ch_result.scalar_one_or_none()

                msg = Message(
                    organization_id=ctx.org_id,
                    channel_id=uuid.UUID(channel_id),
                    sender_id=ctx.user_id,
                    sender_email=ctx.user_email,
                    content=content,
                    reply_to_id=uuid.UUID(data["reply_to_id"]) if data.get("reply_to_id") else None,
                )
                db.add(msg)
                await db.flush()
                await db.refresh(msg)
                await db.commit()

            if channel:
                await _publish_message_event(channel, msg, ctx)

            payload = {
                "type": "message",
                "id": str(msg.id),
                "channel_id": channel_id,
                "sender_id": str(ctx.user_id),
                "sender_email": ctx.user_email,
                "content": content,
                "created_at": msg.created_at.isoformat(),
            }
            await manager.broadcast(channel_id, payload)

    except WebSocketDisconnect:
        manager.disconnect(channel_id, str(ctx.user_id), ws)
        await manager.broadcast(channel_id, {"type": "presence", "user_id": str(ctx.user_id), "status": "offline"})
