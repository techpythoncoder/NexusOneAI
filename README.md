# NexusOne AI — Multi-Tenant SaaS Platform

A cloud-native, AI-powered business operations platform built as a **polyrepo microservice architecture**. Each service is fully independent — its own repo, its own database, its own Dockerfile and compose file.

## Architecture Overview

```
                    Internet
                       │
               ┌───────▼───────┐
               │   api-gateway  │  nginx + auth_request
               │   :8080/:443  │  JWT validated ONCE here
               └───────┬───────┘
                       │ X-User-ID / X-Org-ID / X-User-Role / X-User-Email injected
        ┌──────────────┼──────────────────────────────┐
        │              │                              │
  ┌─────▼──────┐ ┌─────▼──────┐               ┌─────▼──────┐
  │auth-service│ │org-service │   ...8 more..  │audit-svc   │
  │  :8001     │ │  :8002     │               │  :8011     │
  └─────┬──────┘ └────────────┘               └────────────┘
        │ publish events
        ▼
   Apache Kafka   ←── all services publish to nexus.*.events topics
        │
        ▼
  notification-service (subscribes all topics — sends email/push)
  analytics-service    (subscribes all topics — time-series aggregation)
  audit-service        (subscribes all topics — immutable audit log)
```

### Auth Flow (how it works without JWT in every service)

```
Client ──► nginx ──► /internal/auth/validate ──► auth-service
                          │
                          │ 200 OK + response headers:
                          │   X-User-ID: <uuid>
                          │   X-Org-ID: <uuid>
                          │   X-User-Role: admin
                          │   X-User-Email: user@example.com
                          │
                     nginx strips Authorization header
                     nginx injects above headers into upstream
                          │
                          ▼
               downstream service (no JWT library!)
               reads 4 headers → RequestContext
               all DB queries filter by org_id → multi-tenancy
```

## Services

| Service | Port | DB | Description |
|---------|------|----|-------------|
| [api-gateway](./api-gateway/) | 8080 | — | nginx reverse proxy, JWT validation via `auth_request` |
| [auth-service](./auth-service/) | 8001 | Postgres | Registration, login, JWT, OAuth (Google/GitHub), MFA |
| [organization-service](./organization-service/) | 8002 | Postgres | Orgs, membership, invitations, RBAC |
| [project-service](./project-service/) | 8003 | Postgres | Projects, tasks, milestones, comments |
| [notification-service](./notification-service/) | 8004 | Postgres | Email/push notifications via Kafka events |
| [ai-service](./ai-service/) | 8005 | Postgres | Chat with Groq LLM (llama-3.3-70b), BGE-M3 embeddings |
| [search-service](./search-service/) | 8006 | Postgres + OpenSearch | Full-text search across all content |
| [knowledge-service](./knowledge-service/) | 8007 | MongoDB | Wiki, documents, knowledge base |
| [chat-service](./chat-service/) | 8008 | Postgres | Real-time messaging, WebSocket channels |
| [workflow-service](./workflow-service/) | 8009 | Postgres | Automations, triggers, workflow definitions |
| [analytics-service](./analytics-service/) | 8010 | Postgres | Event aggregation, dashboards, metrics |
| [audit-service](./audit-service/) | 8011 | Postgres | Immutable audit log from all Kafka events |

## Database Design

Each service owns **exactly one** database — no cross-service DB access. References to entities in other services use plain UUID columns (no FK constraints). This is the **database-per-service** pattern.

```
auth-service DB         organization-service DB
┌──────────┐           ┌──────────────┐  ┌─────────────┐
│  users   │           │organizations │  │ memberships │
│  - id    │  UUID ref │  - id        │  │ - org_id    │
│  - email │ ─────────►│  - name      │  │ - user_id   │← UUID (not FK)
└──────────┘           │  - slug      │  │ - role      │
                       └──────────────┘  └─────────────┘

project-service DB      chat-service DB
┌──────────┐ ┌────────┐ ┌──────────┐ ┌──────────┐
│ projects │ │ tasks  │ │ channels │ │ messages │
│ - org_id │ │- proj  │ │ - org_id │ │- chan_id  │
│ - owner  │ │  _id   │ │ - name   │ │- sender  │
└──────────┘ └────────┘ └──────────┘ └──────────┘
```

## Kafka Topics & Event Flow

```
Producer               Topic                    Consumers
─────────────────────────────────────────────────────────────
auth-service     → nexus.user.events     → notification, analytics, audit
org-service      → nexus.org.events      → notification, analytics, audit
project-service  → nexus.project.events  → notification, analytics, audit, search
workflow-service → nexus.workflow.events → notification, analytics, audit
ai-service       → nexus.ai.events       → analytics, audit
chat-service     → nexus.chat.events     → notification, audit
knowledge-service→ nexus.knowledge.events→ search, analytics, audit
```

## Local Development

### Prerequisites
- Docker Desktop with ≥8GB RAM allocated
- STAFIO project running (provides Kafka + Redis via `kafka-docker_default` network)
- uv (`brew install uv`)

### Shared Infrastructure (via STAFIO)
The following services are expected on the `kafka-docker_default` network:
- Kafka on `kafka:9092`
- Redis on `redis:6379`

### Running the full stack
```bash
# Start infrastructure first (pgAdmin, Mongo Express, Jaeger)
cd infrastructure && docker compose up -d

# Start each service independently
cd auth-service && cp .env.example .env && make up
cd organization-service && cp .env.example .env && make up
cd project-service && cp .env.example .env && make up
# ... repeat for each service
```

### Running a single service
```bash
cd auth-service
cp .env.example .env       # fill in real secrets
make up                     # docker compose up -d --build
make migrate                # alembic upgrade head
make logs                   # follow logs
```

### IDE Setup (VS Code)
Each service has `.vscode/settings.json` pointing to its local `.venv`.
```bash
cd auth-service
uv venv .venv
uv pip install -e ".[dev]"
```

## Observability

| Tool | URL | Purpose |
|------|-----|---------|
| Jaeger | http://localhost:16686 | Distributed tracing (OTEL) |
| Prometheus | http://localhost:9090 | Metrics from all services |
| pgAdmin | http://localhost:5050 | Postgres GUI (admin@nexus.ai / admin) |
| Mongo Express | http://localhost:8081 | MongoDB GUI |
| Langfuse | http://localhost:3100 | LLM observability (from STAFIO stack) |

## Environment Variables

Every service follows the same pattern:
```
DATABASE_URL=postgresql+asyncpg://...    # service's own Postgres
REDIS_URL=redis://redis:6379/0           # shared Redis (via STAFIO)
KAFKA_BOOTSTRAP_SERVERS=kafka:9092       # shared Kafka (via STAFIO)
OTEL_EXPORTER_OTLP_ENDPOINT=...         # Jaeger
```

Secrets specific to each service are documented in each service's `.env.example`.

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Python 3.12 |
| Package manager | uv |
| Web framework | FastAPI (async) |
| ORM | SQLAlchemy 2.0 (async) + asyncpg |
| MongoDB | Motor (async) |
| Migrations | Alembic (async) |
| Message queue | Apache Kafka (aiokafka) |
| Cache / pub-sub | Redis (redis-py async) |
| LLM | Groq API — llama-3.3-70b-versatile |
| Embeddings | HuggingFace BGE-M3 (1024-dim) |
| Search | OpenSearch (opensearch-py async) |
| Tracing | OpenTelemetry → Jaeger |
| Metrics | Prometheus + prometheus-fastapi-instrumentator |
| LLM observability | Langfuse |
| Logging | structlog (JSON in prod, colored in dev) |
| Container | Docker (multi-stage: builder / development / production) |
| Proxy | nginx (auth_request pattern) |

## Security Model

- **JWT validated once** at the nginx api-gateway via `auth_request`
- **Zero JWT libraries in downstream services** — they only read headers
- **Multi-tenancy enforced at DB layer** — every query filters by `organization_id`
- **Database-per-service** — each service's Postgres is on a private `*-internal` Docker network. Other services physically cannot reach it
- **No cross-service DB sharing** — inter-service data exchange only via Kafka events

## API Documentation

Each service exposes Swagger UI at `/docs` and ReDoc at `/redoc`.

---

## Roadmap — Next Phase

### 🔑 API Keys (Developer Access)

API Keys are currently scaffolded in the UI (Settings → API Keys tab) and the backend can generate/revoke them, but full external developer access is planned for the next phase.

**What API Keys will enable:**

- **Programmatic access** — Developers and scripts can call the NexusOne REST API without logging in through the browser. Instead of email + password, they use a long-lived key:
  ```bash
  curl -H "Authorization: Bearer nxk_live_abc123..." \
    https://your-domain/api/v1/projects/
  ```

- **CI/CD integration** — Automate project creation, task updates, and workflow triggers from GitHub Actions, Jenkins, or any pipeline tool without storing user credentials.

- **Third-party integrations** — Connect NexusOne to external tools (Zapier, Make, Slack bots, custom dashboards) using a dedicated key that can be revoked independently of the user account.

- **Service-to-service calls** — Internal tools like reporting scripts or data exports can authenticate with a scoped key (`read` / `write`) rather than a full user session.

**Planned scope for next phase:**
- [ ] Scoped permissions per key (e.g. `projects:read`, `tasks:write`)
- [ ] Key expiry / rotation policies
- [ ] Per-key usage analytics and rate limiting
- [ ] Developer portal documentation with code examples (Python, JS, cURL)
- [ ] Webhook support — register a URL and receive NexusOne events as HTTP POST payloads
