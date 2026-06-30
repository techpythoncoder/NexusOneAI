# Knowledge Service — NexusOne AI

Wiki, documents, and knowledge base using MongoDB for flexible, schema-flexible document storage.

## Responsibilities
- Create/read/update/delete wiki pages and documents
- Version history (MongoDB document versioning via immutable version records)
- Hierarchical page structure (parent_id tree)
- Publishes to Kafka for search indexing

## Why MongoDB?
Knowledge content is semi-structured — docs have variable fields, nested blocks (Notion-style), and benefit from MongoDB's flexible schema. Postgres would require JSONB gymnastics for the same.

## Collections
```
pages
─────────────────────────────────
_id           ObjectId
organization_id String (indexed)
title         String
content       [Block]    (rich structured blocks)
parent_id     String?
slug          String
tags          [String]
created_by    String (user_id)
created_at    DateTime
updated_at    DateTime

blocks: [{type: "paragraph"|"heading"|"code"|"image", content: "...", ...}]
```

## API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/knowledge/pages` | Create page |
| GET | `/api/v1/knowledge/pages` | List pages (paginated) |
| GET | `/api/v1/knowledge/pages/{id}` | Get page |
| PUT | `/api/v1/knowledge/pages/{id}` | Update page |
| DELETE | `/api/v1/knowledge/pages/{id}` | Delete page |

## Setup
```bash
cp .env.example .env   # Add MONGODB_URL
make up
```
Mongo Express UI: http://localhost:8081
