.PHONY: up down logs migrate shell
COMPOSE = docker compose
up: ; $(COMPOSE) up -d --build
down: ; $(COMPOSE) down -v
logs: ; $(COMPOSE) logs -f audit-service
migrate: ; $(COMPOSE) exec audit-service alembic upgrade head
migrate-generate: ; $(COMPOSE) exec audit-service alembic revision --autogenerate -m "$(MSG)"
shell: ; $(COMPOSE) exec audit-service bash
test: ; $(COMPOSE) exec audit-service python -m pytest tests/ -v
