# Notification Service — NexusOne AI

Consumes Kafka events from all services and delivers email and in-app notifications to users.

## Responsibilities
- Kafka consumer group for all `nexus.*.events` topics
- Template-based email delivery (SMTP)
- In-app notification persistence (Postgres)
- User notification preferences (per org, per event type)

## How It Works
```
project-service ──Kafka──►┐
auth-service    ──Kafka──►├──► notification-service consumer
org-service     ──Kafka──►┘         │
                               maps event_type → template
                                    │
                              send email (SMTP)
                              store Notification record
```

## Database Schema
```
notifications
──────────────────────────────────
id              UUID PK
organization_id UUID
user_id         UUID              recipient
title           VARCHAR
body            TEXT
notification_type VARCHAR         e.g. "task_assigned", "invitation_received"
is_read         BOOL
resource_type   VARCHAR?
resource_id     VARCHAR?
created_at      TIMESTAMPTZ
```

## API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/notifications` | List user's notifications |
| PATCH | `/api/v1/notifications/{id}/read` | Mark as read |
| POST | `/api/v1/notifications/read-all` | Mark all as read |

## Setup
```bash
cp .env.example .env   # Fill in SMTP credentials
make up && make migrate
```

## Email Configuration
Uses SMTP — works with Gmail (use App Password), SendGrid SMTP relay, or any SMTP server.
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASSWORD=your_16_char_app_password
```
