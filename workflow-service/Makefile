.PHONY: up down logs migrate migrate-generate shell test dev

up:
	docker compose up -d

down:
	docker compose down

logs:
	docker compose logs -f workflow-service

migrate:
	docker compose exec workflow-service alembic upgrade head

migrate-generate:
	docker compose exec workflow-service alembic revision --autogenerate -m "$(msg)"

shell:
	docker compose exec workflow-service bash

test:
	docker compose exec workflow-service python -m pytest tests/ -v

dev:
	uv run uvicorn workflow_service.main:app --host 0.0.0.0 --port 8004 --reload
