import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator


class OrganizationCreate(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    slug: str | None = Field(default=None, min_length=2, max_length=100, pattern=r"^[a-z0-9-]+$")
    description: str | None = None
    website: str | None = None

    @field_validator("slug", mode="before")
    @classmethod
    def slugify(cls, v: str | None) -> str | None:
        if v:
            return v.lower().strip()
        return v


class OrganizationUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=255)
    description: str | None = None
    logo_url: str | None = None
    website: str | None = None
    settings: dict | None = None


class OrganizationResponse(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    description: str | None
    logo_url: str | None
    website: str | None
    owner_id: uuid.UUID
    plan: str
    max_members: int
    max_projects: int
    settings: dict
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class OrganizationSummary(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    logo_url: str | None
    plan: str
    member_count: int | None = None

    model_config = {"from_attributes": True}


class DepartmentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    parent_id: uuid.UUID | None = None


class DepartmentResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    name: str
    description: str | None
    parent_id: uuid.UUID | None
    created_by: uuid.UUID
    created_at: datetime

    model_config = {"from_attributes": True}
