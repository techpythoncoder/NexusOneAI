# Workflow Service — NexusOne AI

Automation engine for the platform — define triggers, conditions, and actions that run automatically when events occur across the system.

## Responsibilities
- Define workflow definitions (trigger + conditions + action steps)
- Listen to Kafka events and evaluate which workflows should fire
- Execute workflow runs (sequence of action steps)
- Track execution history and step-level status

## Workflow Model
```
Trigger: "When a task is created in project X"
Condition: "If task.priority == high"
Actions:
  1. Notify #engineering Slack channel
  2. Assign to user Y
  3. Set due_date = today + 2 days
```

## Database Schema
```
workflows                          workflow_runs
──────────────────────────────     ──────────────────────────────
id            UUID PK              id           UUID PK
organization_id UUID               workflow_id  UUID FK
name          VARCHAR              status       ENUM(pending/running/done/failed)
trigger_type  VARCHAR              trigger_data JSONB
trigger_config JSONB               started_at   TIMESTAMPTZ
conditions    JSONB[]              completed_at TIMESTAMPTZ?
actions       JSONB[]
is_active     BOOL
```

## API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/workflows` | Create workflow |
| GET | `/api/v1/workflows` | List workflows |
| GET | `/api/v1/workflows/{id}` | Get workflow |
| PUT | `/api/v1/workflows/{id}` | Update workflow |
| DELETE | `/api/v1/workflows/{id}` | Delete workflow |
| GET | `/api/v1/workflows/{id}/runs` | Execution history |

## Setup
```bash
cp .env.example .env
make up && make migrate
```
