# ── builder stage ────────────────────────────────────────────────────────────
FROM ghcr.io/astral-sh/uv:latest AS uv-source

FROM python:3.12-slim AS builder

COPY --from=uv-source /uv /usr/local/bin/uv

WORKDIR /app

COPY pyproject.toml ./
COPY src/ ./src/

RUN uv pip install --system \
    fastapi \
    "uvicorn[standard]" \
    pydantic \
    pydantic-settings \
    "sqlalchemy[asyncio]" \
    asyncpg \
    alembic \
    "redis[hiredis]" \
    aiokafka \
    httpx \
    structlog \
    python-multipart \
    opentelemetry-api \
    opentelemetry-sdk \
    opentelemetry-instrumentation-fastapi \
    opentelemetry-exporter-otlp-proto-grpc \
    prometheus-fastapi-instrumentator \
    hatchling

# ── development stage ─────────────────────────────────────────────────────────
FROM builder AS development

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app/src

RUN groupadd --gid 1001 nexus && useradd --uid 1001 --gid nexus --shell /bin/bash --create-home nexus
USER nexus

EXPOSE 8003

CMD ["uvicorn", "project_service.main:app", "--host", "0.0.0.0", "--port", "8003", "--reload"]

# ── production stage ──────────────────────────────────────────────────────────
FROM builder AS production

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app/src

RUN groupadd --gid 1001 nexus && useradd --uid 1001 --gid nexus --shell /bin/bash --create-home nexus
USER nexus

EXPOSE 8003

CMD ["uvicorn", "project_service.main:app", "--host", "0.0.0.0", "--port", "8003", "--workers", "4"]
