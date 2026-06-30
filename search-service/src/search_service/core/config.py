from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    SERVICE_NAME: str = "search-service"
    SERVICE_VERSION: str = "1.0.0"
    DEBUG: bool = False
    PORT: int = 8006
    DATABASE_URL: str
    OPENSEARCH_HOST: str = "opensearch"
    OPENSEARCH_PORT: int = 9200
    OPENSEARCH_USER: str = "admin"
    OPENSEARCH_PASSWORD: str = "admin"
    OPENSEARCH_INDEX_PREFIX: str = "nexus"
    REDIS_URL: str = "redis://redis:6379/0"
    KAFKA_BOOTSTRAP_SERVERS: str = "kafka:9092"
    KAFKA_CONSUMER_GROUP: str = "search-service"
    KAFKA_TOPICS: str = "nexus.project.events,nexus.org.events"
    OTEL_EXPORTER_OTLP_ENDPOINT: str = "http://jaeger:4317"
    OTEL_ENABLED: bool = True
    AI_SERVICE_URL: str = "http://ai-service:8005"
    EMBEDDING_DIMENSION: int = 1024

@lru_cache
def get_settings() -> Settings: return Settings()
settings = get_settings()
