FROM python:3.12-slim AS builder
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
WORKDIR /app
COPY pyproject.toml .
RUN uv pip install --system \
    "fastapi>=0.115.0" "uvicorn[standard]>=0.30.0" "pydantic>=2.7.0" \
    "pydantic-settings>=2.3.0" "sqlalchemy[asyncio]>=2.0.31" "asyncpg>=0.29.0" \
    "alembic>=1.13.0" "redis[hiredis]>=5.0.7" "aiokafka>=0.11.0" \
    "httpx>=0.27.0" "structlog>=24.2.0" \
    "opentelemetry-api>=1.25.0" "opentelemetry-sdk>=1.25.0" \
    "opentelemetry-instrumentation-fastapi>=0.46b0" \
    "opentelemetry-exporter-otlp-proto-grpc>=1.25.0" \
    "prometheus-fastapi-instrumentator>=7.0.0"

FROM python:3.12-slim AS development
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin
RUN groupadd -r nexus && useradd -r -g nexus nexus
WORKDIR /app
COPY . .
RUN chown -R nexus:nexus /app
USER nexus
ENV PYTHONPATH=/app/src
EXPOSE 8005
CMD ["uvicorn", "ai_service.main:app", "--host", "0.0.0.0", "--port", "8005", "--reload"]

FROM python:3.12-slim AS production
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin
RUN groupadd -r nexus && useradd -r -g nexus nexus
WORKDIR /app
COPY . .
RUN chown -R nexus:nexus /app
USER nexus
ENV PYTHONPATH=/app/src
EXPOSE 8005
CMD ["uvicorn", "ai_service.main:app", "--host", "0.0.0.0", "--port", "8005", "--workers", "2"]
