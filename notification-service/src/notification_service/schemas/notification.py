import uuid
from datetime import datetime
from pydantic import BaseModel
from notification_service.models.notification import NotificationType

class NotificationResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID | None
    user_id: uuid.UUID
    notification_type: NotificationType
    title: str
    body: str
    action_url: str | None
    is_read: bool
    created_at: datetime
    read_at: datetime | None
    model_config = {"from_attributes": True}

class PaginatedNotificationResponse(BaseModel):
    items: list[NotificationResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
    has_next: bool
    has_prev: bool

class MarkReadRequest(BaseModel):
    notification_ids: list[uuid.UUID]
