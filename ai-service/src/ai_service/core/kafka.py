import json
import logging
from datetime import datetime, timezone
from aiokafka import AIOKafkaProducer
from ai_service.core.config import settings

logger = logging.getLogger(__name__)

_producer: AIOKafkaProducer | None = None


async def get_producer() -> AIOKafkaProducer:
    global _producer
    if _producer is None:
        _producer = AIOKafkaProducer(
            bootstrap_servers=settings.KAFKA_BOOTSTRAP_SERVERS,
            value_serializer=lambda v: json.dumps(v).encode(),
            key_serializer=lambda k: k.encode() if k else None,
            acks="all",
            enable_idempotence=True,
        )
        await _producer.start()
    return _producer


async def stop_producer() -> None:
    global _producer
    if _producer:
        await _producer.stop()
        _producer = None


async def publish_ai_event(event_type: str, payload: dict) -> None:
    """Publish an AI query/response audit event to Kafka."""
    try:
        producer = await get_producer()
        event = {
            "event_type": event_type,
            "service": "ai-service",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "payload": payload,
        }
        await producer.send_and_wait(
            settings.KAFKA_TOPIC_AI_EVENTS,
            value=event,
            key=str(payload.get("organization_id") or payload.get("user_id", "")),
        )
    except Exception:
        logger.exception("Failed to publish Kafka AI event: %s", event_type)
