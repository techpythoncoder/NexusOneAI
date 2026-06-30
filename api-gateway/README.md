# api-gateway

> NexusOne AI — API Gateway (Nginx)

Single entry point for all client traffic. Routes requests to the correct microservice by URL prefix.

## What it does

- **Routing**: maps `/api/v1/<prefix>/` → the owning microservice
- **CORS**: adds headers so the Next.js frontend can call the API
- **WebSocket upgrade**: `/api/v1/chat/` gets proper WS headers for chat-service
- **Request ID**: injects `X-Request-ID` into every request for distributed tracing in Jaeger
- **Timeouts**: AI service gets 3 min timeout (LLM calls are slow); other services get 60s

## Routing table

| URL prefix | Service | Port |
|------------|---------|------|
| `/api/v1/auth/` | auth-service | 8001 |
| `/api/v1/orgs/` | organization-service | 8002 |
| `/api/v1/projects/` | project-service | 8003 |
| `/api/v1/workflows/` | workflow-service | 8004 |
| `/api/v1/ai/` | ai-service | 8005 |
| `/api/v1/search/` | search-service | 8006 |
| `/api/v1/knowledge/` | knowledge-service | 8007 |
| `/api/v1/chat/` | chat-service (WS) | 8008 |
| `/api/v1/notifications/` | notification-service | 8009 |
| `/api/v1/analytics/` | analytics-service | 8010 |
| `/api/v1/audit/` | audit-service | 8011 |

## Run standalone

```bash
docker compose up -d
# Gateway available at http://localhost:8000
curl http://localhost:8000/health
```

## Run in full stack

Handled automatically by the root `docker-compose.yml`.
