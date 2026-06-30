from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    SERVICE_NAME: str = "analytics-service"
    SERVICE_VERSION: str = "1.0.0"
    DEBUG: bool = False
    PORT: int = 8010
    DATABASE_URL: str
    KAFKA_BOOTSTRAP_SERVERS: str = "kafka:9092"
    KAFKA_CONSUMER_GROUP: str = "analytics-service"
    KAFKA_TOPICS: str = "nexus.project.events,nexus.user.events,nexus.org.events,nexus.ai.events"
    OTEL_EXPORTER_OTLP_ENDPOINT: str = "http://jaeger:4317"
    OTEL_ENABLED: bool = True

@lru_cache
def get_settings() -> Settings: return Settings()
settings = get_settings()
