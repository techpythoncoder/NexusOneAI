# infrastructure

> NexusOne AI — Infrastructure & Local Dev Orchestration
> Push to: github.com/your-org/nexus-infrastructure

This is the **ops repo**. It has all Docker infra configs and the local dev orchestration file.

## What lives here

```
infrastructure/
  docker-compose.yml         ← Full-stack local dev (all services + infra together)
  docker-compose.infra.yml   ← Infrastructure only (Postgres, MongoDB, Redis, etc.)
  Makefile                   ← Developer shortcuts: make up, make down, make migrate
  postgres/                  ← Init script: creates one DB per service on first boot
  keycloak/                  ← Realm config: Google + GitHub OAuth wired up
  monitoring/                ← Prometheus scrape config + Grafana datasource
  pgadmin/                   ← pgAdmin server pre-config (no manual setup needed)
  kafka/                     ← Kafka topic bootstrap scripts
  opensearch/                ← OpenSearch index mappings
```

## Local dev setup (clone all repos side by side)

```
NexusOneAI/              ← developer's local folder (NOT a git repo itself)
  api-gateway/           ← git clone github.com/org/api-gateway
  auth-service/          ← git clone github.com/org/auth-service
  organization-service/  ← git clone github.com/org/organization-service
  nexus-core/            ← git clone github.com/org/nexus-core
  infrastructure/        ← git clone github.com/org/infrastructure  ← YOU ARE HERE
```

`docker-compose.yml` sets build context to `../` (the NexusOneAI folder)
so Dockerfiles can access `../nexus-core/` alongside each service.

## Quick start

```bash
cd infrastructure

# Start infrastructure (databases, Kafka, Redis, search)
make infra-up

# Copy env files for each service
cp ../auth-service/.env.example ../auth-service/.env
cp ../organization-service/.env.example ../organization-service/.env

# Start all services + run DB migrations
make up
make migrate

# Access points
#   API Gateway:       http://localhost:8000
#   Auth docs:         http://localhost:8001/docs
#   Org docs:          http://localhost:8002/docs
#   pgAdmin:           http://localhost:5050    admin@nexusone.ai / admin
#   Mongo Express:     http://localhost:8081    admin / admin
#   Jaeger (tracing):  http://localhost:16686
#   MailHog (emails):  http://localhost:8025
```

## How nexus-core is imported by services

| Where | Method |
|-------|--------|
| **Local dev** (this repo) | Build context is `../` — Dockerfile does `COPY nexus-core /tmp && pip install /tmp/nexus-core` |
| **CI/CD** (GitHub Actions) | Workflow checks out auth-service + nexus-core repos side-by-side, builds with same `../` context |
| **Production** (final) | Publish nexus-core to PyPI → services install `nexus-core>=0.1.0`, no COPY needed |

## Infrastructure services

| Service | URL | Login |
|---------|-----|-------|
| pgAdmin | http://localhost:5050 | admin@nexusone.ai / admin |
| Mongo Express | http://localhost:8081 | admin / admin |
| Jaeger | http://localhost:16686 | — |
| MailHog | http://localhost:8025 | — |
| Keycloak | http://localhost:8082 | admin / admin |
| MinIO Console | http://localhost:9003 | nexus_minio / nexus_minio_2024 |
| Grafana | http://localhost:3001 | admin / admin |
| OpenSearch UI | http://localhost:5601 | — |
