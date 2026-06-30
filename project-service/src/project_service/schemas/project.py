import uuid
from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from project_service.models.project import ProjectPriority, ProjectStatus


# ── Project schemas ───────────────────────────────────────────────────────────

class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    key: str = Field(..., min_length=1, max_length=10, pattern=r"^[A-Z0-9]+$")
    description: str | None = None
    priority: ProjectPriority = ProjectPriority.MEDIUM
    start_date: date | None = None
    due_date: date | None = None


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    status: ProjectStatus | None = None
    priority: ProjectPriority | None = None
    due_date: date | None = None
    settings: dict[str, Any] | None = None


class ProjectResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    name: str
    key: str
    description: str | None
    status: ProjectStatus
    priority: ProjectPriority
    owner_id: uuid.UUID
    start_date: date | None
    due_date: date | None
    settings: dict[str, Any]
    is_archived: bool
    created_by: uuid.UUID
    created_at: datetime
    updated_at: datetime


# ── Milestone schemas ─────────────────────────────────────────────────────────

class MilestoneCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    due_date: date | None = None


class MilestoneResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    project_id: uuid.UUID
    name: str
    description: str | None
    due_date: date | None
    is_completed: bool
    completed_at: datetime | None
    created_at: datetime
