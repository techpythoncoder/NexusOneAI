# Analytics Service — NexusOne AI

Consumes all Kafka events and stores time-series analytics records for dashboards and reporting.

## Responsibilities
- Kafka consumer for ALL nexus.*.events topics
- Persist every event as an `AnalyticsEvent` record
- REST API for querying aggregated analytics by time window

## How It Works
```
All services ──Kafka──► analytics-service consumer ──► analytics_events table
                                                             │
client ──► GET /api/v1/analytics/summary?days=30 ───────────┘
           returns: {event_type, count} grouped
```

## Database Schema
```
analytics_events
────────────────────────────────
id              UUID PK
organization_id UUID (indexed)
user_id         UUID? (indexed)
event_type      VARCHAR (indexed)  e.g. "project.created", "task.completed"
resource_type   VARCHAR?           e.g. "project", "task"
resource_id     VARCHAR?
properties      JSONB              original event payload
occurred_at     TIMESTAMPTZ (indexed)
```

## API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/analytics/summary?days=30` | Event type counts |
| GET | `/api/v1/analytics/events?event_type=...&days=7` | Raw events list |

## Setup
```bash
cp .env.example .env
make up && make migrate
```
