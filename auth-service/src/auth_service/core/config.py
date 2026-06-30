from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Service
    SERVICE_NAME: str = "auth-service"
    SERVICE_VERSION: str = "1.0.0"
    DEBUG: bool = False
    PORT: int = 8001

    # Database — this service's own Postgres
    DATABASE_URL: str
    DATABASE_POOL_SIZE: int = 10
    DATABASE_MAX_OVERFLOW: int = 20

    # Redis (from STAFIO stack, shared)
    REDIS_URL: str = "redis://redis:6379/0"
    REDIS_TOKEN_DB: int = 1   # db 1 for token blacklist, keeps it separate

    # JWT
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # Google OAuth (kept for direct flow fallback)
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/api/v1/auth/oauth/google/callback"

    # GitHub OAuth (kept for direct flow fallback)
    GITHUB_CLIENT_ID: str = ""
    GITHUB_CLIENT_SECRET: str = ""
    GITHUB_REDIRECT_URI: str = "http://localhost:8000/api/v1/auth/oauth/github/callback"

    # Keycloak — handles Google + GitHub SSO
    KEYCLOAK_URL: str = "http://keycloak:8080"            # internal Docker URL
    KEYCLOAK_PUBLIC_URL: str = "http://localhost:8180"    # browser-visible URL
    KEYCLOAK_REALM: str = "nexusone"
    KEYCLOAK_CLIENT_ID: str = "nexusone-backend"
    KEYCLOAK_CLIENT_SECRET: str = "nexusone-keycloak-secret-2024"
    KEYCLOAK_REDIRECT_URI: str = "http://localhost:8000/api/v1/auth/oauth/keycloak/callback"
    KEYCLOAK_ADMIN: str = "admin"
    KEYCLOAK_ADMIN_PASSWORD: str = "admin"
    KEYCLOAK_ADMIN_CLIENT_ID: str = "admin-cli"

    # Kafka
    KAFKA_BOOTSTRAP_SERVERS: str = "kafka:9092"
    KAFKA_TOPIC_USER_EVENTS: str = "nexus.user.events"
    KAFKA_TOPIC_ORG_EVENTS: str = "nexus.org.events"
    KAFKA_CONSUMER_GROUP: str = "auth-service"

    # Email (MailHog for local dev)
    SMTP_HOST: str = "mailhog"
    SMTP_PORT: int = 1025
    SMTP_FROM: str = "noreply@nexusone.ai"

    # Frontend URL for redirect links in emails
    FRONTEND_URL: str = "http://localhost:3000"

    # Backblaze B2 (S3-compatible) — avatar / file storage
    B2_KEY_ID: str = ""
    B2_APPLICATION_KEY: str = ""
    B2_ENDPOINT: str = ""
    B2_BUCKET: str = ""

    # OpenTelemetry
    OTEL_EXPORTER_OTLP_ENDPOINT: str = "http://jaeger:4317"
    OTEL_ENABLED: bool = True


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
