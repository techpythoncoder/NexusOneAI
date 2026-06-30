import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from project_service.models.task import TaskPriority, TaskStatus


class TaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    description: str | None = None
    status: TaskStatus = TaskStatus.TODO
    priority: TaskPriority = TaskPriority.MEDIUM
    assignee_id: uuid.UUID | None = None
    due_date: datetime | None = None
    parent_task_id: uuid.UUID | None = None
    estimated_hours: float | None = Field(default=None, ge=0)
    assignee_email: str | None = None


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=500)
    description: str | None = None
    status: TaskStatus | None = None
    priority: TaskPriority | None = None
    assignee_id: uuid.UUID | None = None
    due_date: datetime | None = None
    actual_hours: float | None = Field(default=None, ge=0)
    position: int | None = None
    assignee_email: str | None = None


class TaskResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    project_id: uuid.UUID
    task_number: int
    title: str
    description: str | None
    status: TaskStatus
    priority: TaskPriority
    assignee_id: uuid.UUID | None
    reporter_id: uuid.UUID
    parent_task_id: uuid.UUID | None
    estimated_hours: float | None
    actual_hours: float | None
    due_date: datetime | None
    completed_at: datetime | None
    position: int
    created_at: datetime
    updated_at: datetime
