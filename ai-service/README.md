# AI Service — NexusOne AI

Handles LLM conversations (Groq/llama-3.3-70b), embeddings (HuggingFace BGE-M3), and conversation history. Integrates with Langfuse for LLM observability.

## Responsibilities
- Streaming and non-streaming chat completions via Groq API
- 1024-dim embeddings via BGE-M3 on HuggingFace Inference API
- Per-organization conversation history stored in Postgres
- Publishes `nexus.ai.events` to Kafka (analytics, audit)

## Database Schema
```
conversations                  completions
─────────────────────────────  ─────────────────────────────
id            UUID PK          id            UUID PK
organization_id UUID           conversation_id UUID FK
user_id       UUID             prompt_tokens  INT
title         VARCHAR          completion_tokens INT
created_at    TIMESTAMPTZ      model         VARCHAR
updated_at    TIMESTAMPTZ      created_at    TIMESTAMPTZ
                               messages      JSONB[]
```

## API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/ai/chat` | Chat completion (non-streaming) |
| POST | `/api/v1/ai/chat/stream` | Streaming SSE chat |
| POST | `/api/v1/ai/embeddings` | Generate BGE-M3 embeddings |
| GET | `/api/v1/ai/conversations` | List user conversations |
| GET | `/api/v1/ai/conversations/{id}` | Get conversation with messages |
| DELETE | `/api/v1/ai/conversations/{id}` | Delete conversation |

## Setup
```bash
cp .env.example .env   # Add GROQ_API_KEY, HUGGINGFACE_API_KEY
make up
make migrate
```

## Environment
- `GROQ_API_KEY` — from console.groq.com
- `HUGGINGFACE_API_KEY` — from huggingface.co
- `LANGFUSE_SECRET_KEY` / `LANGFUSE_PUBLIC_KEY` — from STAFIO Langfuse instance
