from contextlib import asynccontextmanager
import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
from ai_service.core.config import settings
from ai_service.routes.ai import router as ai_router

def configure_logging():
    import logging, sys
    import structlog as sl
    sl.configure(processors=[sl.stdlib.add_log_level, sl.processors.TimeStamper(fmt="iso"), sl.dev.ConsoleRenderer() if settings.DEBUG else sl.processors.JSONRenderer()], wrapper_class=sl.make_filtering_bound_logger(logging.DEBUG if settings.DEBUG else logging.INFO), logger_factory=sl.PrintLoggerFactory(file=sys.stdout), cache_logger_on_first_use=True)
    logging.basicConfig(format="%(message)s", stream=sys.stdout, level=logging.DEBUG if settings.DEBUG else logging.INFO)

configure_logging()
logger = structlog.get_logger()

from ai_service.core.kafka import stop_producer

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("ai-service starting", model=settings.GROQ_MODEL)
    yield
    logger.info("ai-service shutting down")
    await stop_producer()

app = FastAPI(title="NexusOne AI Service", version=settings.SERVICE_VERSION, lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
Instrumentator().instrument(app).expose(app)
app.include_router(ai_router)

@app.get("/health")
async def health():
    return {"status": "ok", "service": settings.SERVICE_NAME, "model": settings.GROQ_MODEL}

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled exception", path=request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})
