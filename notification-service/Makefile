.PHONY: up down logs migrate migrate-generate shell test dev

up:
	docker compose up -d

down:
	docker compose down

logs:
	docker compose logs -f notification-service

migrate:
	docker compose exec notification-service alembic upgrade head

migrate-generate:
	docker compose exec notification-service alembic revision --autogenerate -m "$(msg)"

shell:
	docker compose exec notification-service bash

test:
	docker compose exec notification-service python -m pytest tests/ -v

dev:
	uv run uvicorn notification_service.main:app --host 0.0.0.0 --port 8009 --reload
