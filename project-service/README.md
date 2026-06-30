# NexusOne Project Service

Project and task management microservice for the NexusOne AI platform. Handles projects, tasks, milestones, labels, and comments with strict per-org multi-tenancy.

## Purpose

Provides the project management core of NexusOne: create and track projects, break them into tasks with Kanban-style ordering and subtask support, attach milestones, and leave threaded comments. Publishes Kafka events so other services react to task lifecycle changes.

## Database Schema

```
projects
  id               UUID PK
  organization_id  UUID  (tenant isolation — indexed)
  name             VARCHAR(255)
  description      TEXT
  key              VARCHAR(10)   e.g. "PROJ" — unique per org
  status           ENUM  PLANNING|ACTIVE|ON_HOLD|COMPLETED|ARCHIVED
  priority         ENUM  LOW|MEDIUM|HIGH|CRITICAL
  owner_id         UUID  (user from auth-service, no FK)
  start_date       DATE
  due_date         DATE
  settings         JSONB
  is_archived      BOOLEAN
  created_by       UUID
  created_at       TIMESTAMPTZ
  updated_at       TIMESTAMPTZ
  UNIQUE (organization_id, key)

tasks
  id               UUID PK
  organization_id  UUID  (indexed)
  project_id       UUID  FK→projects CASCADE
  task_number      INT   sequential per project
  title            VARCHAR(500)
  description      TEXT
  status           ENUM  TODO|IN_PROGRESS|IN_REVIEW|DONE|CANCELLED
  priority         ENUM  LOW|MEDIUM|HIGH|CRITICAL
  assignee_id      UUID  nullable
  reporter_id      UUID
  parent_task_id   UUID  FK→tasks nullable  (subtasks)
  estimated_hours  FLOAT
  actual_hours     FLOAT
  due_date         TIMESTAMPTZ
  completed_at     TIMESTAMPTZ
  position         INT   kanban ordering
  created_at       TIMESTAMPTZ
  updated_at       TIMESTAMPTZ
  UNIQUE (project_id, task_number)

labels
  id               UUID PK
  organization_id  UUID  (indexed)
  project_id       UUID  FK→projects CASCADE
  name             VARCHAR(100)
  color            VARCHAR(7)  hex e.g. "#6366f1"
  UNIQUE (project_id, name)

task_labels  (many-to-many)
  task_id          UUID FK→tasks CASCADE
  label_id         UUID FK→labels CASCADE
  PRIMARY KEY (task_id, label_id)

comments
  id               UUID PK
  organization_id  UUID  (indexed)
  task_id          UUID  FK→tasks CASCADE
  author_id        UUID
  content          TEXT
  is_edited        BOOLEAN
  created_at       TIMESTAMPTZ
  updated_at       TIMESTAMPTZ

milestones
  id               UUID PK
  organization_id  UUID  (indexed)
  project_id       UUID  FK→projects CASCADE
  name             VARCHAR(255)
  description      TEXT
  due_date         DATE
  is_completed     BOOLEAN
  completed_at     TIMESTAMPTZ
  created_at       TIMESTAMPTZ
```

## Multi-Tenancy

Every database query filters by `organization_id`. This value is read from the `X-Org-ID` header injected by nginx after JWT validation. The service never validates tokens itself — it trusts the gateway. All service functions accept `org_id` as an explicit parameter and include it in every `WHERE` clause, so data from one organisation can never leak to another even if a bug exposes the wrong `project_id`.

## Kafka Events

All events are published to the `nexus.project.events` topic.

| Event              | Trigger                             |
|--------------------|-------------------------------------|
| `project.created`  | POST /api/v1/projects/              |
| `project.archived` | DELETE /api/v1/projects/{id}        |
| `task.created`     | POST .../tasks/                     |
| `task.updated`     | PATCH .../tasks/{id} (non-DONE)     |
| `task.completed`   | PATCH .../tasks/{id} → status=DONE  |
| `task.assigned`    | PATCH .../tasks/{id} with new assignee_id |

## API Endpoints

| Method | Path                                                              | Description              |
|--------|-------------------------------------------------------------------|--------------------------|
| POST   | /api/v1/projects/                                                 | Create project           |
| GET    | /api/v1/projects/                                                 | List projects            |
| GET    | /api/v1/projects/{id}                                             | Get project              |
| PATCH  | /api/v1/projects/{id}                                             | Update project           |
| DELETE | /api/v1/projects/{id}                                             | Archive project          |
| POST   | /api/v1/projects/{id}/milestones                                  | Create milestone         |
| GET    | /api/v1/projects/{id}/milestones                                  | List milestones          |
| PATCH  | /api/v1/projects/{id}/milestones/{mid}/complete                   | Complete milestone       |
| POST   | /api/v1/projects/{id}/tasks/                                      | Create task              |
| GET    | /api/v1/projects/{id}/tasks/                                      | List tasks               |
| GET    | /api/v1/projects/{id}/tasks/{task_id}                             | Get task                 |
| PATCH  | /api/v1/projects/{id}/tasks/{task_id}                             | Update task              |
| DELETE | /api/v1/projects/{id}/tasks/{task_id}                             | Delete task              |
| POST   | /api/v1/projects/{id}/tasks/{task_id}/comments/                   | Add comment              |
| GET    | /api/v1/projects/{id}/tasks/{task_id}/comments/                   | List comments            |
| PATCH  | /api/v1/projects/{id}/tasks/{task_id}/comments/{cid}              | Edit comment (author only)|
| DELETE | /api/v1/projects/{id}/tasks/{task_id}/comments/{cid}              | Delete comment (author only)|
| GET    | /health                                                           | Health check             |
| GET    | /metrics                                                          | Prometheus metrics       |
| GET    | /docs                                                             | Swagger UI               |

## Running Standalone

### Prerequisites

- Docker and Docker Compose
- The `kafka-docker_default` external network must exist (from the shared kafka stack)

### Quick start

```bash
cp .env.example .env
make up
make migrate
```

### Local development (no Docker)

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env
# Edit .env to point to a local Postgres and Kafka
make dev
```

### Generate a migration

```bash
make migrate-generate MSG="add index on tasks assignee"
```

### Run tests

```bash
make test
```
