import asyncio
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator

from auth_service.core.config import settings
from auth_service.core.kafka import stop_producer
from auth_service.core.logging import configure_logging
from auth_service.routes import auth, users
from auth_service.services.event_consumer import start_consumer
from auth_service.services.keycloak_admin_service import ensure_central_client

configure_logging()
logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("auth-service starting", version=settings.SERVICE_VERSION)

    # OpenTelemetry tracing setup
    if settings.OTEL_ENABLED:
        from opentelemetry import trace
        from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
        from opentelemetry.sdk.resources import SERVICE_NAME, Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor

        provider = TracerProvider(resource=Resource({SERVICE_NAME: settings.SERVICE_NAME}))
        provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(
            endpoint=settings.OTEL_EXPORTER_OTLP_ENDPOINT,
            insecure=True,
        )))
        trace.set_tracer_provider(provider)
        FastAPIInstrumentor.instrument_app(app, tracer_provider=provider)
        logger.info("OpenTelemetry tracing enabled", endpoint=settings.OTEL_EXPORTER_OTLP_ENDPOINT)

    # Ensure central client redirect settings for identity provider brokering
    await ensure_central_client()

    # Start background event consumer
    _consumer_task = asyncio.create_task(start_consumer())
    logger.info("Background Kafka event consumer started")

    yield

    logger.info("auth-service shutting down")
    if _consumer_task and not _consumer_task.done():
        _consumer_task.cancel()
        try:
            await _consumer_task
        except asyncio.CancelledError:
            pass
    await stop_producer()


app = FastAPI(
    title="NexusOne Auth Service",
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

# Prometheus metrics at /metrics
Instrumentator().instrument(app).expose(app)

# Routers
app.include_router(auth.router)
app.include_router(users.router)


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
        if path_name in ["/health", "/metrics"] or "auth" in path_name:
            # Skip security lock for auth registration/login routes & health/metrics
            if "me" not in path_name:
                continue
        for method in path.values():
            method["security"] = [{"BearerAuth": []}]
    app.openapi_schema = openapi_schema
    return app.openapi_schema

app.openapi = custom_openapi


@app.get("/health")
async def health():
    return {"status": "ok", "service": settings.SERVICE_NAME, "version": settings.SERVICE_VERSION}


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled exception", path=request.url.path, exc_info=exc)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})
