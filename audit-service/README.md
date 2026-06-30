# Audit Service — NexusOne AI

Immutable audit log for compliance and security — records every state-changing event across the entire platform by consuming all Kafka topics.

## Responsibilities
- Kafka consumer for ALL nexus.*.events topics
- Store every event as an immutable `AuditLog` record (no updates, no deletes at DB level)
- REST API for admins to query audit history with filtering

## Audit Log Design
Records are **write-once**. The table has no UPDATE paths in the application code. DB-level enforcement can be added via row-level security or a `RULE` if needed.

## Database Schema
```
audit_logs
────────────────────────────────
id              UUID PK
organization_id UUID? (indexed)
actor_id        UUID?            user who performed the action
actor_email     VARCHAR?
action          VARCHAR (indexed) e.g. "user.registered", "project.deleted"
resource_type   VARCHAR?
resource_id     VARCHAR?
source_service  VARCHAR          which service emitted the event
payload         JSONB            full original event payload
occurred_at     TIMESTAMPTZ (indexed)
```

## API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/audit/logs` | Query audit logs (admin only, org-scoped) |

Query params: `action`, `resource_type`, `actor_id`, `days` (1–365), `skip`, `limit`.

## Access Control
The route reads `X-User-Role` from the nginx-injected header. Only `admin` and `owner` roles should be allowed to read audit logs — enforce this in the route handler or via nginx location config.

## Setup
```bash
cp .env.example .env
make up && make migrate
```
