# organization-service

> NexusOne AI — Multi-Tenant Organization Management

Every paying customer of NexusOne AI is an **Organization** (tenant). This service owns everything about that relationship.

## Responsibilities

- **Organization CRUD** — create, read, update, deactivate organizations
- **Slug generation** — `"Acme Corp"` → `acme-corp` (URL-safe unique identifier)
- **Member management** — invite by email, assign roles (owner/admin/member/viewer)
- **Department tree** — self-referential departments (Engineering → Backend Team)
- **Invitations** — tokenized invite links, expiry, accept/decline
- **Subscriptions** — free/pro/enterprise plans with limits (users, storage, AI calls)
- **Usage tracking** — monthly counters for AI calls, API calls, storage, active users

## Database (`nexus_org` — PostgreSQL)

```
organizations      id, name, slug(unique), owner_id, is_active …
memberships        id, org_id, user_id(from auth), role, dept_id
departments        id, org_id, parent_id(self-ref tree), name, head_user_id
invitations        id, org_id, email, token(unique), expires_at, accepted_at
subscriptions      id, org_id(unique), plan, status, max_users, max_ai_calls …
usage_tracking     id, org_id, month(date), ai_calls_used, storage_gb …
```

## Kafka events

| Direction | Topic | When |
|-----------|-------|------|
| Consumes | `nexusone.user.registered` | Auto-creates default org for new user |
| Publishes | `nexusone.org.created` | New organization created |
| Publishes | `nexusone.org.member_invited` | User invited to org |
| Publishes | `nexusone.org.member_joined` | Invite accepted |

## API endpoints

```
POST   /api/v1/orgs
GET    /api/v1/orgs
GET    /api/v1/orgs/{org_id}
PATCH  /api/v1/orgs/{org_id}
DELETE /api/v1/orgs/{org_id}

GET    /api/v1/orgs/{org_id}/members
POST   /api/v1/orgs/{org_id}/members/invite
DELETE /api/v1/orgs/{org_id}/members/{user_id}
PATCH  /api/v1/orgs/{org_id}/members/{user_id}/role

GET    /api/v1/orgs/{org_id}/departments
POST   /api/v1/orgs/{org_id}/departments
PATCH  /api/v1/orgs/{org_id}/departments/{dept_id}

GET    /api/v1/orgs/{org_id}/subscription
GET    /api/v1/orgs/{org_id}/usage
```

## Run standalone

```bash
cp .env.example .env
docker compose up -d
# Docs at http://localhost:8002/docs
```
