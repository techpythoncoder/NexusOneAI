import asyncio, json, logging, sys
from contextlib import asynccontextmanager
import structlog as sl
sl.configure(processors=[sl.stdlib.add_log_level, sl.processors.TimeStamper(fmt="iso"), sl.dev.ConsoleRenderer()], wrapper_class=sl.make_filtering_bound_logger(logging.INFO), logger_factory=sl.PrintLoggerFactory(file=sys.stdout), cache_logger_on_first_use=True)
logging.basicConfig(format="%(message)s", stream=sys.stdout, level=logging.INFO)

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
from audit_service.core.config import settings
from audit_service.core.database import AsyncSessionLocal
from audit_service.models.audit_log import AuditLog
from audit_service.routes.audit import router

logger = structlog.get_logger()
_consumer_task = None


async def _consume_events():
    import uuid
    from aiokafka import AIOKafkaConsumer
    topics = [t.strip() for t in settings.KAFKA_TOPICS.split(",")]
    consumer = AIOKafkaConsumer(*topics, bootstrap_servers=settings.KAFKA_BOOTSTRAP_SERVERS, group_id=settings.KAFKA_CONSUMER_GROUP, value_deserializer=lambda v: json.loads(v.decode()), auto_offset_reset="earliest")
    await consumer.start()
    logger.info("Audit Kafka consumer started", topics=topics)
    try:
        async for msg in consumer:
            event = msg.value
            payload = event.get("payload", {})
            org_id_str = payload.get("organization_id")
            async with AsyncSessionLocal() as db:
                try:
                    db.add(AuditLog(
                        organization_id=uuid.UUID(org_id_str) if org_id_str else None,
                        actor_id=uuid.UUID(payload["user_id"]) if payload.get("user_id") else None,
                        actor_email=payload.get("email"),
                        action=event.get("event_type", "unknown"),
                        resource_type=payload.get("resource_type"),
                        resource_id=payload.get("resource_id") or payload.get("organization_id") or payload.get("user_id"),
                        source_service=event.get("service", "unknown"),
                        payload=payload,
                    ))
                    await db.commit()
                except Exception:
                    await db.rollback()
                    logger.exception("Failed to store audit log")
    finally:
        await consumer.stop()


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _consumer_task
    _consumer_task = asyncio.create_task(_consume_events())
    yield
    if _consumer_task: _consumer_task.cancel()

app = FastAPI(title="NexusOne Audit Service", version=settings.SERVICE_VERSION, lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
Instrumentator().instrument(app).expose(app)
app.include_router(router)

@app.get("/health")
async def health(): return {"status": "ok", "service": settings.SERVICE_NAME}

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled exception", path=request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})
