from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    SERVICE_NAME: str = "knowledge-service"
    SERVICE_VERSION: str = "1.0.0"
    DEBUG: bool = False
    PORT: int = 8007
    MONGODB_URL: str = "mongodb://nexus:nexus_mongo_2024@mongodb:27017"
    MONGODB_DB: str = "nexus_knowledge"
    REDIS_URL: str = "redis://redis:6379/0"
    KAFKA_BOOTSTRAP_SERVERS: str = "kafka:9092"
    KAFKA_TOPIC_KNOWLEDGE_EVENTS: str = "nexus.knowledge.events"
    OTEL_EXPORTER_OTLP_ENDPOINT: str = "http://jaeger:4317"
    OTEL_ENABLED: bool = True

@lru_cache
def get_settings() -> Settings: return Settings()
settings = get_settings()
