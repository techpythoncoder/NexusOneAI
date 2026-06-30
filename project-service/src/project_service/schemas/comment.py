import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class CommentCreate(BaseModel):
    content: str = Field(..., min_length=1)
    parent_id: uuid.UUID | None = None
    mentioned_emails: list[str] = []
    mentioned_user_ids: list[uuid.UUID] = []


class CommentUpdate(BaseModel):
    content: str = Field(..., min_length=1)


class CommentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    task_id: uuid.UUID
    author_id: uuid.UUID
    parent_id: uuid.UUID | None
    content: str
    is_edited: bool
    created_at: datetime
    updated_at: datetime
