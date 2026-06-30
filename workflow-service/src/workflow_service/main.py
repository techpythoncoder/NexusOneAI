from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator

from workflow_service.core.config import settings
from workflow_service.core.kafka import stop_producer
from workflow_service.core.logging import configure_logging
from workflow_service.routes.workflows import router as workflows_router

configure_logging()
logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    import asyncio
    from workflow_service.core.consumer import consume

    logger.info("workflow-service starting", version=settings.SERVICE_VERSION)
    if settings.OTEL_ENABLED:
        from opentelemetry import trace
        from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
        from opentelemetry.sdk.resources import SERVICE_NAME, Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
        provider = TracerProvider(resource=Resource({SERVICE_NAME: settings.SERVICE_NAME}))
        provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(endpoint=settings.OTEL_EXPORTER_OTLP_ENDPOINT, insecure=True)))
        trace.set_tracer_provider(provider)
        FastAPIInstrumentor.instrument_app(app, tracer_provider=provider)

    consumer_task = asyncio.create_task(consume())
    yield
    consumer_task.cancel()
    try:
        await consumer_task
    except asyncio.CancelledError:
        pass
    logger.info("workflow-service shutting down")
    await stop_producer()


app = FastAPI(title="NexusOne Workflow Service", version=settings.SERVICE_VERSION, lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
Instrumentator().instrument(app).expose(app)
app.include_router(workflows_router)


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
async def health():
    return {"status": "ok", "service": settings.SERVICE_NAME, "version": settings.SERVICE_VERSION}


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled exception", path=request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})
