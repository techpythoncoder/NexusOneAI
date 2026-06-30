.PHONY: up down logs migrate shell
COMPOSE = docker compose
up: ; $(COMPOSE) up -d --build
down: ; $(COMPOSE) down -v
logs: ; $(COMPOSE) logs -f knowledge-service
migrate: ; $(COMPOSE) exec knowledge-service alembic upgrade head
migrate-generate: ; $(COMPOSE) exec knowledge-service alembic revision --autogenerate -m "$(MSG)"
shell: ; $(COMPOSE) exec knowledge-service bash
test: ; $(COMPOSE) exec knowledge-service python -m pytest tests/ -v
