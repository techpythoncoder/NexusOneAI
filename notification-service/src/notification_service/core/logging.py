import logging, sys
import structlog
from notification_service.core.config import settings

def configure_logging() -> None:
    level = logging.DEBUG if settings.DEBUG else logging.INFO
    structlog.configure(
        processors=[structlog.contextvars.merge_contextvars, structlog.stdlib.add_log_level, structlog.processors.TimeStamper(fmt="iso"), structlog.processors.JSONRenderer() if not settings.DEBUG else structlog.dev.ConsoleRenderer()],
        wrapper_class=structlog.make_filtering_bound_logger(level),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(file=sys.stdout),
        cache_logger_on_first_use=True,
    )
    logging.basicConfig(format="%(message)s", stream=sys.stdout, level=level)
