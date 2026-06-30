.PHONY: up down logs migrate shell test
COMPOSE = docker compose
up: ; $(COMPOSE) up -d --build
down: ; $(COMPOSE) down -v
logs: ; $(COMPOSE) logs -f ai-service
migrate: ; $(COMPOSE) exec ai-service alembic upgrade head
migrate-generate: ; $(COMPOSE) exec ai-service alembic revision --autogenerate -m "$(MSG)"
shell: ; $(COMPOSE) exec ai-service bash
test: ; $(COMPOSE) exec ai-service python -m pytest tests/ -v
