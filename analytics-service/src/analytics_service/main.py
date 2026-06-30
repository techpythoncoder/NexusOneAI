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
from analytics_service.core.config import settings
from analytics_service.core.database import AsyncSessionLocal
from analytics_service.models.event import AnalyticsEvent
from analytics_service.routes.analytics import router

logger = structlog.get_logger()
_consumer_task = None


async def _consume_events():
    from aiokafka import AIOKafkaConsumer
    topics = [t.strip() for t in settings.KAFKA_TOPICS.split(",")]
    consumer = AIOKafkaConsumer(*topics, bootstrap_servers=settings.KAFKA_BOOTSTRAP_SERVERS, group_id=settings.KAFKA_CONSUMER_GROUP, value_deserializer=lambda v: json.loads(v.decode()), auto_offset_reset="earliest")
    await consumer.start()
    logger.info("Analytics Kafka consumer started", topics=topics)
    try:
        async for msg in consumer:
            event = msg.value
            payload = event.get("payload", {})
            org_id = payload.get("organization_id")
            if not org_id:
                continue
            async with AsyncSessionLocal() as db:
                try:
                    import uuid
                    db.add(AnalyticsEvent(organization_id=uuid.UUID(org_id), user_id=uuid.UUID(payload["user_id"]) if payload.get("user_id") else None, event_type=event.get("event_type", "unknown"), resource_type=payload.get("resource_type"), resource_id=payload.get("resource_id") or payload.get("project_id") or payload.get("task_id"), properties=payload))
                    await db.commit()
                except Exception:
                    await db.rollback()
                    logger.exception("Failed to store analytics event")
    finally:
        await consumer.stop()


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _consumer_task
    _consumer_task = asyncio.create_task(_consume_events())
    yield
    if _consumer_task: _consumer_task.cancel()

app = FastAPI(title="NexusOne Analytics Service", version=settings.SERVICE_VERSION, lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
Instrumentator().instrument(app).expose(app)
app.include_router(router)

# Custom OpenAPI schema to display Bearer Authorization lock in Swagger UI
from fastapi.openapi.utils import get_openapi

def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    openapi_schema = get_openapi(
        title=app.title,
        version=app.version,
        routes=app.routes,
    )
    openapi_schema["components"] = openapi_schema.get("components", {})
    openapi_schema["components"]["securitySchemes"] = {
        "BearerAuth": {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT"
        }
    }
    for path_name, path in openapi_schema["paths"].items():
        if path_name in ["/health", "/metrics"]:
            continue
        for method in path.values():
            method["security"] = [{"BearerAuth": []}]
    app.openapi_schema = openapi_schema
    return app.openapi_schema

app.openapi = custom_openapi


@app.get("/health")
async def health(): return {"status": "ok", "service": settings.SERVICE_NAME}

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled exception", path=request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})
