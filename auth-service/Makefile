.PHONY: up down logs migrate migrate-generate shell test lint

COMPOSE = docker compose

up:
	$(COMPOSE) up -d --build

down:
	$(COMPOSE) down -v

logs:
	$(COMPOSE) logs -f auth-service

# Run Alembic migrations inside the running container
migrate:
	$(COMPOSE) exec auth-service alembic upgrade head

# Auto-generate a migration from model changes
# Usage: make migrate-generate MSG="add user table"
migrate-generate:
	$(COMPOSE) exec auth-service alembic revision --autogenerate -m "$(MSG)"

shell:
	$(COMPOSE) exec auth-service bash

test:
	$(COMPOSE) exec auth-service python -m pytest tests/ -v

lint:
	uv run ruff check src/ && uv run ruff format --check src/

# Local dev (no Docker) — requires .venv
dev:
	DATABASE_URL=postgresql+asyncpg://nexus:nexus_secret_2024@localhost:5440/nexus_auth \
	.venv/bin/uvicorn auth_service.main:app --reload --port 8001 --app-dir src
