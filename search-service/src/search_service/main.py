from contextlib import asynccontextmanager
import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
from search_service.core.config import settings
from search_service.routes.search import router

import logging, sys
import structlog as sl
sl.configure(processors=[sl.stdlib.add_log_level, sl.processors.TimeStamper(fmt="iso"), sl.dev.ConsoleRenderer()], wrapper_class=sl.make_filtering_bound_logger(logging.INFO), logger_factory=sl.PrintLoggerFactory(file=sys.stdout), cache_logger_on_first_use=True)
logging.basicConfig(format="%(message)s", stream=sys.stdout, level=logging.INFO)
logger = structlog.get_logger()

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("search-service starting")
    yield
    from search_service.services.opensearch_service import _client
    if _client:
        await _client.close()

app = FastAPI(title="NexusOne Search Service", version=settings.SERVICE_VERSION, lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
Instrumentator().instrument(app).expose(app)
app.include_router(router)

@app.get("/health")
async def health():
    return {"status": "ok", "service": settings.SERVICE_NAME}

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled exception path=%s", request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})
