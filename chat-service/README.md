# Chat Service — NexusOne AI

Real-time team messaging with persistent channels, WebSocket connections, and message history.

## Responsibilities
- Channel management (public, private, direct messages)
- Real-time WebSocket messaging with in-process fan-out
- Persistent message storage in Postgres
- Thread replies via `reply_to_id`

## Real-time Architecture
```
Client A ──WS──► chat-service instance 1 ─┐
Client B ──WS──► chat-service instance 1 ─┼──► broadcast to all
Client C ──WS──► chat-service instance 2 ─┘    connections in channel
```

For multi-instance deployments, Redis pub/sub would handle cross-instance fan-out (the ConnectionManager is ready for this extension).

## WebSocket Auth
WebSocket upgrade requests cannot carry custom HTTP headers, so user context is passed as **query params**:
```
ws://host/api/v1/chat/channels/{id}/ws?user_id=<uuid>&org_id=<uuid>
```
These are injected by the client using the values received from the REST API (which itself got them from the nginx-injected headers).

## Database Schema
```
channels                       messages
─────────────────────────────  ─────────────────────────────
id            UUID PK          id            UUID PK
organization_id UUID           organization_id UUID
name          VARCHAR          channel_id    UUID FK → channels
channel_type  ENUM             sender_id     UUID
created_by    UUID             sender_email  VARCHAR
is_archived   BOOL             content       TEXT
created_at    TIMESTAMPTZ      reply_to_id   UUID? FK → messages
                               is_edited     BOOL
                               created_at    TIMESTAMPTZ
```

## API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/chat/channels` | Create channel |
| GET | `/api/v1/chat/channels` | List channels for org |
| GET | `/api/v1/chat/channels/{id}/messages` | Message history |
| WS | `/api/v1/chat/channels/{id}/ws` | Real-time WebSocket |

## Setup
```bash
cp .env.example .env
make up && make migrate
```
