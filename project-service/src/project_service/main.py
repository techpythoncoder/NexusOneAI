from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator

from project_service.core.config import settings
from project_service.core.kafka import stop_producer
from project_service.core.logging import configure_logging
from project_service.models.comment import Comment  # noqa: F401 — register ORM mapper
from project_service.models.label import Label  # noqa: F401 — register ORM mapper
from project_service.models.milestone import Milestone  # noqa: F401 — register ORM mapper
from project_service.models.project import Project  # noqa: F401 — register ORM mapper
from project_service.models.task import Task  # noqa: F401 — register ORM mapper
from project_service.models.task_label import task_labels  # noqa: F401 — register ORM mapper
from project_service.routes.comments import router as comments_router
from project_service.routes.projects import router as projects_router
from project_service.routes.tasks import router as tasks_router

configure_logging()
logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("project-service starting", version=settings.SERVICE_VERSION)

    if settings.OTEL_ENABLED:
        from opentelemetry import trace
        from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
        from opentelemetry.sdk.resources import SERVICE_NAME, Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor

        provider = TracerProvider(resource=Resource({SERVICE_NAME: settings.SERVICE_NAME}))
        provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(
            endpoint=settings.OTEL_EXPORTER_OTLP_ENDPOINT, insecure=True,
        )))
        trace.set_tracer_provider(provider)
        FastAPIInstrumentor.instrument_app(app, tracer_provider=provider)

    yield

    logger.info("project-service shutting down")
    await stop_producer()


app = FastAPI(
    title="NexusOne Project Service",
    version=settings.SERVICE_VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

Instrumentator().instrument(app).expose(app)

app.include_router(projects_router)
app.include_router(tasks_router)
app.include_router(comments_router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": settings.SERVICE_NAME, "version": settings.SERVICE_VERSION}


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled exception", path=request.url.path, exc_info=exc)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})
