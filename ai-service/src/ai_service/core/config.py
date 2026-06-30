from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    SERVICE_NAME: str = "ai-service"
    SERVICE_VERSION: str = "1.0.0"
    DEBUG: bool = False
    PORT: int = 8005

    # Groq — LLM inference (llama-3.3-70b-versatile)
    GROQ_API_KEY: str
    GROQ_MODEL: str = "llama-3.3-70b-versatile"
    GROQ_MAX_TOKENS: int = 4096
    GROQ_TEMPERATURE: float = 0.7

    # HuggingFace — BGE-M3 embeddings (runs locally via inference API)
    HUGGINGFACE_API_KEY: str = ""
    EMBEDDING_MODEL: str = "BAAI/bge-m3"
    EMBEDDING_DIMENSION: int = 1024

    DATABASE_URL: str
    REDIS_URL: str = "redis://redis:6379/0"
    KAFKA_BOOTSTRAP_SERVERS: str = "kafka:9092"
    KAFKA_TOPIC_AI_EVENTS: str = "nexus.ai.events"

    # Langfuse — LLM observability (reuse STAFIO's running instance)
    LANGFUSE_SECRET_KEY: str = ""
    LANGFUSE_PUBLIC_KEY: str = ""
    LANGFUSE_HOST: str = "http://langfuse:3100"

    OTEL_EXPORTER_OTLP_ENDPOINT: str = "http://jaeger:4317"
    OTEL_ENABLED: bool = True

    # Per-org rate limiting
    AI_CALLS_PER_MINUTE: int = 30

    # Microservice URLs for tool execution
    ORGANIZATION_SERVICE_URL: str = "http://organization-service:8002"
    PROJECT_SERVICE_URL: str = "http://project-service:8003"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
