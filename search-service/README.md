# Search Service — NexusOne AI

Full-text search across all organization content using OpenSearch. Receives index events via Kafka from other services.

## Responsibilities
- Full-text search with org-scoped queries (OpenSearch filter by `organization_id`)
- Index events for projects, tasks, documents, knowledge base articles
- Search suggestions and faceted search

## Architecture
```
project-service ──Kafka──► search-service ──► OpenSearch index
knowledge-service──────────►(consumer)         (org-scoped)
                                │
client ──► GET /search ─────────┘ query OpenSearch → return results
```

## API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/search?q=...&type=...` | Full-text search |
| POST | `/api/v1/search/index` | Index a document (internal) |
| DELETE | `/api/v1/search/index/{id}` | Remove from index |

## Setup
```bash
cp .env.example .env
make up          # starts service + OpenSearch
```
OpenSearch UI: http://localhost:9200

## OpenSearch Index
All documents share one index per org with the field `organization_id` on every doc — every query has `filter: [{term: {organization_id: <org_id>}}]` so one tenant can never see another's data.
