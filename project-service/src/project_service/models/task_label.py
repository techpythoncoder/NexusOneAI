from sqlalchemy import Column, ForeignKey, PrimaryKeyConstraint, Table
from sqlalchemy.dialects.postgresql import UUID

from project_service.core.database import Base

task_labels = Table(
    "task_labels",
    Base.metadata,
    Column(
        "task_id",
        UUID(as_uuid=True),
        ForeignKey("tasks.id", ondelete="CASCADE"),
        nullable=False,
    ),
    Column(
        "label_id",
        UUID(as_uuid=True),
        ForeignKey("labels.id", ondelete="CASCADE"),
        nullable=False,
    ),
    PrimaryKeyConstraint("task_id", "label_id", name="pk_task_labels"),
)
