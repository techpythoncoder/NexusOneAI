from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    SERVICE_NAME: str = "workflow-service"
    SERVICE_VERSION: str = "1.0.0"
    DEBUG: bool = False
    PORT: int = 8004

    DATABASE_URL: str = "postgresql+asyncpg://nexus:nexus@localhost:5432/nexus_workflows"
    DATABASE_POOL_SIZE: int = 10
    DATABASE_MAX_OVERFLOW: int = 20

    REDIS_URL: str = "redis://redis:6379/0"

    KAFKA_BOOTSTRAP_SERVERS: str = "kafka:9092"
    KAFKA_TOPIC_WORKFLOW_EVENTS: str = "nexus.workflow.events"
    KAFKA_CONSUMER_GROUP: str = "workflow-service"

    OTEL_EXPORTER_OTLP_ENDPOINT: str = "http://jaeger:4317"
    OTEL_ENABLED: bool = True

    FRONTEND_URL: str = "http://localhost:3000"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
