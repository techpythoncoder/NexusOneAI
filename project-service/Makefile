.PHONY: up down logs migrate migrate-generate shell test dev

up:
	docker compose up -d

down:
	docker compose down

logs:
	docker compose logs -f project-service

migrate:
	docker compose exec project-service alembic upgrade head

migrate-generate:
	docker compose exec project-service alembic revision --autogenerate -m "$(MSG)"

shell:
	docker compose exec project-service bash

test:
	docker compose exec project-service python -m pytest tests/ -v

dev:
	docker compose up project-postgres -d
	PYTHONPATH=src uvicorn project_service.main:app --host 0.0.0.0 --port 8003 --reload
