import json
import logging
import asyncio
import uuid
from aiokafka import AIOKafkaConsumer
from sqlalchemy import select

from auth_service.core.config import settings
from auth_service.core.database import AsyncSessionLocal
from auth_service.models.user import User
from auth_service.services.keycloak_admin_service import create_tenant_realm, create_keycloak_user

logger = logging.getLogger(__name__)

async def process_event(event: dict) -> None:
    event_type = event.get("event_type", "")
    payload = event.get("payload", {})
    
    if event_type == "org.created":
        slug = payload.get("slug")
        name = payload.get("name")
        owner_id_str = payload.get("owner_id")
        
        if slug and name:
            try:
                await create_tenant_realm(slug, name)
            except Exception:
                logger.exception("Failed to create Keycloak realm for org slug: %s", slug)
                return
            
            if owner_id_str:
                try:
                    owner_id = uuid.UUID(owner_id_str)
                    async with AsyncSessionLocal() as db:
                        result = await db.execute(select(User).where(User.id == owner_id))
                        owner = result.scalar_one_or_none()
                        if owner:
                            await create_keycloak_user(slug, owner.email, owner.full_name)
                        else:
                            logger.error("Owner %s not found in Postgres for Keycloak provisioning", owner_id)
                except Exception:
                    logger.exception("Failed to provision owner %s in Keycloak realm %s", owner_id_str, slug)
        else:
            logger.warning("Received org.created event with missing slug or name: %s", payload)

    elif event_type == "org.member.joined":
        slug = payload.get("organization_slug")
        user_id_str = payload.get("user_id")
        
        if slug and user_id_str:
            try:
                user_id = uuid.UUID(user_id_str)
                async with AsyncSessionLocal() as db:
                    result = await db.execute(select(User).where(User.id == user_id))
                    user = result.scalar_one_or_none()
                    if user:
                        await create_keycloak_user(slug, user.email, user.full_name)
                    else:
                        logger.error("User %s not found in Postgres for Keycloak provisioning", user_id)
            except Exception:
                logger.exception("Failed to provision user %s in Keycloak realm %s", user_id_str, slug)
        else:
            logger.warning("Received org.member.joined event with missing slug or user_id: %s", payload)

async def start_consumer() -> None:
    """Consumes Kafka events from org events topic indefinitely in background."""
    logger.info("Initializing Kafka consumer for topics: [%s] group: %s", settings.KAFKA_TOPIC_ORG_EVENTS, settings.KAFKA_CONSUMER_GROUP)
    consumer = AIOKafkaConsumer(
        settings.KAFKA_TOPIC_ORG_EVENTS,
        bootstrap_servers=settings.KAFKA_BOOTSTRAP_SERVERS,
        group_id=settings.KAFKA_CONSUMER_GROUP,
        value_deserializer=lambda v: json.loads(v.decode()),
        auto_offset_reset="earliest",
        enable_auto_commit=True,
        session_timeout_ms=30000,
        heartbeat_interval_ms=8000,
        max_poll_interval_ms=300000,
    )
    await consumer.start()
    logger.info("Kafka consumer started listening to org events")
    try:
        async for msg in consumer:
            try:
                await process_event(msg.value)
            except Exception:
                logger.exception("Failed to process event at offset %s", msg.offset)
    except asyncio.CancelledError:
        logger.info("Kafka consumer task cancelled")
    finally:
        await consumer.stop()
        logger.info("Kafka consumer stopped")
