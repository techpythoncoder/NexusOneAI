FROM ghcr.io/astral-sh/uv:latest AS uv

# ── builder ──────────────────────────────────────────────────────────────────
FROM python:3.12-slim AS builder
COPY --from=uv /uv /usr/local/bin/uv
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy

COPY pyproject.toml ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --no-dev --no-install-project

COPY src ./src
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --no-dev

# ── development ──────────────────────────────────────────────────────────────
FROM python:3.12-slim AS development
COPY --from=uv /uv /usr/local/bin/uv
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy PATH="/app/.venv/bin:$PATH"

COPY pyproject.toml ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --no-install-project

COPY src ./src
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync

RUN useradd -m -u 1001 nexus && chown -R nexus:nexus /app
USER nexus
EXPOSE 8004
CMD ["uvicorn", "workflow_service.main:app", "--host", "0.0.0.0", "--port", "8004", "--reload"]

# ── production ────────────────────────────────────────────────────────────────
FROM python:3.12-slim AS production
WORKDIR /app
ENV PATH="/app/.venv/bin:$PATH"

COPY --from=builder /app/.venv /app/.venv
COPY --from=builder /app/src /app/src

RUN useradd -m -u 1001 nexus && chown -R nexus:nexus /app
USER nexus
EXPOSE 8004
CMD ["uvicorn", "workflow_service.main:app", "--host", "0.0.0.0", "--port", "8004", "--workers", "2"]
