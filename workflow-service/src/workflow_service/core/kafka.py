import json
import logging
from datetime import datetime, timezone

from aiokafka import AIOKafkaProducer

from workflow_service.core.config import settings

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


async def publish_workflow_event(event_type: str, payload: dict) -> None:
    producer = await get_producer()
    event = {
        "event_type": event_type,
        "service": "workflow-service",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "payload": payload,
    }
    try:
        await producer.send_and_wait(
            settings.KAFKA_TOPIC_WORKFLOW_EVENTS,
            value=event,
            key=payload.get("organization_id"),
        )
    except Exception:
        logger.exception("Failed to publish Kafka event: %s", event_type)
