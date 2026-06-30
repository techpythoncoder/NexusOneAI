# =============================================================================
# NexusOne AI — Developer Makefile
# Run from: NexusOneAI/infrastructure/
# =============================================================================

.PHONY: help up down infra-up infra-down logs migrate migrate-auth migrate-org \
        test shell clean

# Build context for docker compose is ../ (NexusOneAI root)
# so Dockerfiles can access ../nexus-core alongside service folders
COMPOSE_INFRA := docker compose -f docker-compose.infra.yml
COMPOSE_ALL   := docker compose -f docker-compose.yml --project-directory ..

help:
	@echo ""
	@echo "NexusOne AI — Developer Commands  (run from infrastructure/)"
	@echo "════════════════════════════════════════════════════════════"
	@echo "  make infra-up      Start DBs, Kafka, Redis, OpenSearch, etc."
	@echo "  make infra-down    Stop infrastructure"
	@echo "  make up            Start full stack (infra + all services)"
	@echo "  make down          Stop everything"
	@echo "  make logs          Tail all logs"
	@echo "  make migrate       Run DB migrations for all services"
	@echo "  make migrate-auth  Run auth-service migrations only"
	@echo "  make migrate-org   Run organization-service migrations only"
	@echo "  make shell S=X     Open shell inside container X"
	@echo "  make clean         Remove all volumes (DATA LOSS WARNING)"
	@echo ""
	@echo "  Standalone (from service directory):"
	@echo "    cd ../auth-service && docker compose up -d"
	@echo "════════════════════════════════════════════════════════════"
	@echo ""

infra-up:
	@echo "▶ Starting infrastructure..."
	$(COMPOSE_INFRA) up -d
	@echo "✓ Infrastructure running"
	@$(COMPOSE_INFRA) ps

infra-down:
	$(COMPOSE_INFRA) down

infra-logs:
	$(COMPOSE_INFRA) logs -f

up:
	@echo "▶ Starting full NexusOne AI stack..."
	$(COMPOSE_ALL) up -d --build
	@echo ""
	@echo "✓ Stack running:"
	@echo "  API Gateway:      http://localhost:8000"
	@echo "  Auth docs:        http://localhost:8001/docs"
	@echo "  Org docs:         http://localhost:8002/docs"
	@echo "  pgAdmin:          http://localhost:5050   (admin@nexusone.ai / admin)"
	@echo "  Mongo Express:    http://localhost:8081   (admin / admin)"
	@echo "  Jaeger tracing:   http://localhost:16686"
	@echo "  MailHog emails:   http://localhost:8025"
	@echo ""

down:
	$(COMPOSE_ALL) down

logs:
	$(COMPOSE_ALL) logs -f

migrate: migrate-auth migrate-org

migrate-auth:
	@echo "▶ auth-service migrations..."
	$(COMPOSE_ALL) run --rm auth-service alembic upgrade head

migrate-org:
	@echo "▶ organization-service migrations..."
	$(COMPOSE_ALL) run --rm organization-service alembic upgrade head

shell:
	@[ "$(S)" ] || (echo "Usage: make shell S=auth-service" && exit 1)
	$(COMPOSE_ALL) exec $(S) /bin/bash

clean:
	@echo "⚠ This deletes ALL Docker volumes (database data gone)."
	@read -p "Type YES to confirm: " ans; [ "$$ans" = "YES" ] || exit 1
	$(COMPOSE_ALL) down -v --remove-orphans
	$(COMPOSE_INFRA) down -v --remove-orphans
