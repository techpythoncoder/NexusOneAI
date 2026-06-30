import uuid
from datetime import datetime
from enum import Enum

from sqlalchemy import Boolean, DateTime, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from workflow_service.core.database import Base


class TriggerType(str, Enum):
    TASK_STATUS_CHANGED = "task_status_changed"
    TASK_CREATED = "task_created"
    TASK_ASSIGNED = "task_assigned"
    PROJECT_CREATED = "project_created"
    SCHEDULE = "schedule"
    WEBHOOK = "webhook"
    MANUAL = "manual"


class ActionType(str, Enum):
    SEND_NOTIFICATION = "send_notification"
    CREATE_TASK = "create_task"
    UPDATE_TASK = "update_task"
    CALL_WEBHOOK = "call_webhook"
    SEND_EMAIL = "send_email"
    PUBLISH_KAFKA_EVENT = "publish_kafka_event"


class Workflow(Base):
    __tablename__ = "workflows"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    trigger_type: Mapped[str] = mapped_column(String(50), nullable=False)
    trigger_config: Mapped[dict] = mapped_column(JSONB, default={}, nullable=False)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    run_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
