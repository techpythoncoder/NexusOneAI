import json
import logging
from datetime import datetime, timezone

from aiokafka import AIOKafkaProducer

from auth_service.core.config import settings

logger = logging.getLogger(__name__)

_producer: AIOKafkaProducer | None = None


async def get_producer() -> AIOKafkaProducer:
    global _producer
    if _producer is None:
        _producer = AIOKafkaProducer(
            bootstrap_servers=settings.KAFKA_BOOTSTRAP_SERVERS,
            value_serializer=lambda v: json.dumps(v).encode(),
            key_serializer=lambda k: k.encode() if k else None,
            acks="all",              # wait for all replicas — no event loss
            enable_idempotence=True,
        )
        await _producer.start()
    return _producer


async def stop_producer() -> None:
    global _producer
    if _producer:
        await _producer.stop()
        _producer = None


async def publish_user_event(event_type: str, payload: dict) -> None:
    """Publish a user domain event to Kafka.

    Other services (org-service, notification-service, etc.) subscribe to
    this topic to react to user lifecycle events without calling auth-service
    directly.
    """
    producer = await get_producer()
    event = {
        "event_type": event_type,
        "service": "auth-service",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "payload": payload,
    }
    try:
        await producer.send_and_wait(
            settings.KAFKA_TOPIC_USER_EVENTS,
            value=event,
            key=payload.get("user_id"),
        )
    except Exception:
        # Log but don't fail the HTTP request — Kafka is best-effort for events
        logger.exception("Failed to publish Kafka event: %s", event_type)
