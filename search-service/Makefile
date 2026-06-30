.PHONY: up down logs migrate shell
COMPOSE = docker compose
up: ; $(COMPOSE) up -d --build
down: ; $(COMPOSE) down -v
logs: ; $(COMPOSE) logs -f search-service
migrate: ; $(COMPOSE) exec search-service alembic upgrade head
migrate-generate: ; $(COMPOSE) exec search-service alembic revision --autogenerate -m "$(MSG)"
shell: ; $(COMPOSE) exec search-service bash
test: ; $(COMPOSE) exec search-service python -m pytest tests/ -v
