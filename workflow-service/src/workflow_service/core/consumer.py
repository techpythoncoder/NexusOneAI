"""
Kafka consumer for the workflow-service.

Listens to project/org/user events and automatically triggers any active
workflows whose trigger_type matches the incoming event and whose
trigger_config conditions match the event payload.
"""

import asyncio
import json
import logging
import uuid

from aiokafka import AIOKafkaConsumer

from workflow_service.core.config import settings
from workflow_service.core.database import AsyncSessionLocal

logger = logging.getLogger(__name__)

# Kafka event_type → workflow trigger_type
TRIGGER_MAP: dict[str, str] = {
    "task.created":    "task_created",
    "task.updated":    "task_status_changed",
    "task.completed":  "task_status_changed",
    "task.assigned":   "task_assigned",
    "project.created": "project_created",
}

TOPICS = [
    "nexus.project.events",
    "nexus.org.events",
    "nexus.user.events",
]


async def _process_event(event: dict) -> None:
    event_type = event.get("event_type", "")
    trigger_type = TRIGGER_MAP.get(event_type)
    if not trigger_type:
        return

    payload = event.get("payload", {})
    org_id_str = payload.get("organization_id")
    if not org_id_str:
        return

    try:
        org_id = uuid.UUID(org_id_str)
    except ValueError:
        return

    # Import here to avoid circular imports at module load time
    from workflow_service.services import workflow_service

    async with AsyncSessionLocal() as db:
        try:
            count = await workflow_service.auto_trigger(db, trigger_type, org_id, payload)
            if count:
                logger.info("Auto-triggered %d workflow(s) for event %s org %s",
                            count, event_type, org_id_str)
        except Exception:
            logger.exception("Failed auto-triggering workflows for event %s", event_type)


async def consume() -> None:
    consumer = AIOKafkaConsumer(
        *TOPICS,
        bootstrap_servers=settings.KAFKA_BOOTSTRAP_SERVERS,
        group_id=f"{settings.KAFKA_CONSUMER_GROUP}-trigger",
        value_deserializer=lambda v: json.loads(v.decode()),
        auto_offset_reset="latest",
    )
    await consumer.start()
    logger.info("Workflow trigger consumer started on topics: %s", TOPICS)
    try:
        async for msg in consumer:
            asyncio.create_task(_process_event(msg.value))
    finally:
        await consumer.stop()
        logger.info("Workflow trigger consumer stopped")
