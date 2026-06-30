# NexusOne AI — Frontend

Next.js 15 + shadcn/ui + Tailwind CSS frontend for the NexusOne AI platform.

## Stack
- **Next.js 15** (App Router, Turbopack)
- **shadcn/ui + Tailwind CSS v4** (Base UI primitives)
- **TanStack Query v5** — data fetching & caching
- **Zustand** — auth state (persisted to localStorage)
- **Recharts** — analytics charts
- **@dnd-kit** — Kanban drag & drop
- **React Hook Form + Zod** — form validation
- **axios** — HTTP client with JWT interceptor

## Pages
| Route | Description |
|-------|-------------|
| `/login` | Email/password + Google/GitHub OAuth |
| `/register` | Account creation |
| `/` | Dashboard — stats, event breakdown, quick actions |
| `/projects` | Project list |
| `/projects/[id]` | Kanban board (drag & drop tasks between columns) |
| `/ai` | AI chat with streaming (Groq llama-3.3-70b) |
| `/knowledge` | Knowledge base — page list |
| `/knowledge/[id]` | Page view + inline editor |
| `/chat` | Real-time team messaging via WebSocket |
| `/analytics` | Event charts (bar + pie), period selector |
| `/team` | Members list + invite modal |
| `/notifications` | Notification center, mark as read |

## Setup
```bash
cp .env.local.example .env.local   # set NEXT_PUBLIC_API_URL
npm install
npm run dev                         # http://localhost:3000
```

## Environment Variables
```
NEXT_PUBLIC_API_URL=http://localhost:8080   # nginx api-gateway
```
