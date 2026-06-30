from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    SERVICE_NAME: str = "notification-service"
    SERVICE_VERSION: str = "1.0.0"
    DEBUG: bool = False
    PORT: int = 8009

    DATABASE_URL: str
    DATABASE_POOL_SIZE: int = 10
    DATABASE_MAX_OVERFLOW: int = 20

    REDIS_URL: str = "redis://redis:6379/0"

    KAFKA_BOOTSTRAP_SERVERS: str = "kafka:9092"
    KAFKA_CONSUMER_GROUP: str = "notification-service"
    # Comma-separated list of topics this service subscribes to
    KAFKA_TOPICS: str = "nexus.user.events,nexus.org.events,nexus.project.events,nexus.workflow.events,nexus.chat.events"

    SMTP_HOST: str = "mailhog"
    SMTP_PORT: int = 1025
    SMTP_FROM: str = "noreply@nexusone.ai"
    SMTP_TLS: bool = False

    FRONTEND_URL: str = "http://localhost:3002"

    OTEL_EXPORTER_OTLP_ENDPOINT: str = "http://jaeger:4317"
    OTEL_ENABLED: bool = True

    @property
    def kafka_topics_list(self) -> list[str]:
        return [t.strip() for t in self.KAFKA_TOPICS.split(",")]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
