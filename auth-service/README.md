# auth-service

> NexusOne AI — Identity & Access Management

Owns all authentication and token issuance. Every protected request passes through this service via the nginx `auth_request` mechanism — no other service validates JWTs.

## Responsibilities

| Concern | Detail |
|---------|--------|
| User registration / login | Email+password with bcrypt hashing |
| JWT issuance | Access token (15 min) + Refresh token (30 days) |
| Token validation | `/api/v1/auth/validate` — called by nginx before every protected route |
| OAuth2 | Google and GitHub sign-in/sign-up |
| MFA | TOTP (Google Authenticator compatible) |
| API Keys | Programmatic access with SHA-256 hashed keys |
| Token revocation | Redis blacklist + per-user token registry |
| Password reset | Email token flow (via MailHog locally) |

## Auth architecture — how nginx delegates to this service

```
Client → nginx → (auth_request) → auth-service /api/v1/auth/validate
                                        ↓ 200 + headers
                      nginx injects: X-User-ID, X-Org-ID, X-User-Role, X-User-Email
                                        ↓
                               upstream service (no JWT knowledge)
```

No other service imports JWT libraries. They read the four injected headers.

## Database schema

```
users
  id (UUID PK)
  email (unique)
  hashed_password (nullable — OAuth users have no password)
  current_organization_id (FK hint — authoritative list in org-service)
  is_active, is_verified, mfa_enabled
  verification_token, password_reset_token
  created_at, last_login_at

refresh_tokens
  id, jti (unique), user_id (FK → users)
  user_agent, ip_address   ← for "active sessions" UI
  is_revoked, expires_at, revoked_at

oauth_accounts
  id, user_id (FK → users)
  provider (google|github), provider_user_id
  access_token, refresh_token   ← provider tokens (not our JWTs)
  UNIQUE (provider, provider_user_id)

api_keys
  id, user_id, organization_id
  name, key_prefix, key_hash (SHA-256)
  scopes, is_active, expires_at, last_used_at
```

## Kafka events published

| Topic | Event type | Trigger |
|-------|-----------|---------|
| `nexus.user.events` | `user.registered` | New user sign-up |
| `nexus.user.events` | `user.email_verified` | Email verification |
| `nexus.user.events` | `user.logged_in` | Successful login |
| `nexus.user.events` | `user.password_reset_requested` | Password reset trigger |

`org-service` and `notification-service` subscribe to this topic.

## API endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/auth/register` | No | Create account |
| GET | `/api/v1/auth/verify-email?token=` | No | Verify email address |
| POST | `/api/v1/auth/login` | No | Login, returns JWT pair |
| POST | `/api/v1/auth/logout` | Bearer | Revoke all tokens |
| POST | `/api/v1/auth/refresh` | refresh_token | Get new access token |
| GET | `/api/v1/auth/validate` | Bearer | **nginx auth_request endpoint** |
| POST | `/api/v1/auth/password-reset/request` | No | Send reset email |
| POST | `/api/v1/auth/password-reset/confirm` | No | Apply new password |
| POST | `/api/v1/auth/mfa/setup` | Bearer | Get TOTP secret + QR |
| POST | `/api/v1/auth/mfa/verify` | Bearer | Enable MFA |
| GET | `/api/v1/auth/oauth/google/authorize` | No | Google OAuth redirect |
| GET | `/api/v1/auth/oauth/google/callback` | No | Google OAuth callback |
| GET | `/api/v1/auth/oauth/github/authorize` | No | GitHub OAuth redirect |
| GET | `/api/v1/auth/oauth/github/callback` | No | GitHub OAuth callback |
| GET | `/api/v1/users/me` | Bearer | Get own profile |
| PATCH | `/api/v1/users/me` | Bearer | Update profile |
| POST | `/api/v1/users/me/api-keys` | Bearer | Create API key |
| GET | `/api/v1/users/me/api-keys` | Bearer | List API keys |
| DELETE | `/api/v1/users/me/api-keys/{id}` | Bearer | Revoke API key |

## Running standalone

```bash
# 1. Copy env
cp .env.example .env

# 2. Start service + its own Postgres
make up

# 3. Run migrations
make migrate

# 4. View logs
make logs

# 5. Open API docs
open http://localhost:8001/docs
```

## Structure

```
auth-service/
├── src/auth_service/
│   ├── core/           # config, database, redis, kafka, logging, exceptions
│   ├── models/         # SQLAlchemy ORM: user, refresh_token, oauth_account, api_key
│   ├── schemas/        # Pydantic request/response schemas
│   ├── routes/         # FastAPI routers: auth.py, users.py
│   ├── services/       # Business logic: jwt_service, user_service, oauth_service
│   └── main.py         # FastAPI app, lifespan, middleware
├── alembic/            # Database migrations
├── tests/
├── Dockerfile
├── docker-compose.yml  # Standalone (service + its own Postgres)
├── pyproject.toml
└── .env.example
```
