.PHONY: up down logs migrate shell
COMPOSE = docker compose
up: ; $(COMPOSE) up -d --build
down: ; $(COMPOSE) down -v
logs: ; $(COMPOSE) logs -f analytics-service
migrate: ; $(COMPOSE) exec analytics-service alembic upgrade head
migrate-generate: ; $(COMPOSE) exec analytics-service alembic revision --autogenerate -m "$(MSG)"
shell: ; $(COMPOSE) exec analytics-service bash
test: ; $(COMPOSE) exec analytics-service python -m pytest tests/ -v
