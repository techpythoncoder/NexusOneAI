.PHONY: up down logs migrate shell
COMPOSE = docker compose
up: ; $(COMPOSE) up -d --build
down: ; $(COMPOSE) down -v
logs: ; $(COMPOSE) logs -f chat-service
migrate: ; $(COMPOSE) exec chat-service alembic upgrade head
migrate-generate: ; $(COMPOSE) exec chat-service alembic revision --autogenerate -m "$(MSG)"
shell: ; $(COMPOSE) exec chat-service bash
test: ; $(COMPOSE) exec chat-service python -m pytest tests/ -v
