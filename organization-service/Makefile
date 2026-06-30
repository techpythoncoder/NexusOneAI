.PHONY: up down logs migrate migrate-generate shell test

COMPOSE = docker compose

up:
	$(COMPOSE) up -d --build

down:
	$(COMPOSE) down -v

logs:
	$(COMPOSE) logs -f organization-service

migrate:
	$(COMPOSE) exec organization-service alembic upgrade head

migrate-generate:
	$(COMPOSE) exec organization-service alembic revision --autogenerate -m "$(MSG)"

shell:
	$(COMPOSE) exec organization-service bash

test:
	$(COMPOSE) exec organization-service python -m pytest tests/ -v

dev:
	DATABASE_URL=postgresql+asyncpg://nexus:nexus_secret_2024@localhost:5441/nexus_org \
	.venv/bin/uvicorn organization_service.main:app --reload --port 8002 --app-dir src
