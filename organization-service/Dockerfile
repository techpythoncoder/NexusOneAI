# =============================================================================
# Organization Service — Dockerfile
# Build context: this directory (organization-service/)
# Completely self-contained — no external repo needed
# =============================================================================

FROM python:3.12-slim AS builder

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

COPY pyproject.toml .
RUN uv pip install --system \
    "fastapi>=0.115.0" \
    "uvicorn[standard]>=0.30.0" \
    "pydantic>=2.7.0" \
    "pydantic-settings>=2.3.0" \
    "sqlalchemy[asyncio]>=2.0.31" \
    "asyncpg>=0.29.0" \
    "alembic>=1.13.0" \
    "redis[hiredis]>=5.0.7" \
    "aiokafka>=0.11.0" \
    "python-jose[cryptography]>=3.3.0" \
    "httpx>=0.27.0" \
    "structlog>=24.2.0" \
    "python-multipart>=0.0.9" \
    "email-validator>=2.1.0" \
    "python-slugify>=8.0.4" \
    "opentelemetry-api>=1.25.0" \
    "opentelemetry-sdk>=1.25.0" \
    "opentelemetry-instrumentation-fastapi>=0.46b0" \
    "opentelemetry-exporter-otlp-proto-grpc>=1.25.0" \
    "prometheus-fastapi-instrumentator>=7.0.0"

# ── Development ───────────────────────────────────────────────────────────────
FROM python:3.12-slim AS development

LABEL service="organization-service" stage="development"

COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

RUN useradd -m -u 1000 nexus
USER nexus
WORKDIR /app

COPY --chown=nexus:nexus src ./src
COPY --chown=nexus:nexus alembic.ini .
COPY --chown=nexus:nexus alembic ./alembic

ENV PYTHONPATH=/app/src
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

EXPOSE 8002
CMD ["uvicorn", "organization_service.main:app", "--host", "0.0.0.0", "--port", "8002", "--reload"]

# ── Production ────────────────────────────────────────────────────────────────
FROM python:3.12-slim AS production

LABEL service="organization-service" stage="production"

COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

RUN useradd -m -u 1000 nexus
USER nexus
WORKDIR /app

COPY --chown=nexus:nexus src ./src
COPY --chown=nexus:nexus alembic.ini .
COPY --chown=nexus:nexus alembic ./alembic

ENV PYTHONPATH=/app/src
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

EXPOSE 8002
CMD ["uvicorn", "organization_service.main:app", "--host", "0.0.0.0", "--port", "8002", "--workers", "4"]
