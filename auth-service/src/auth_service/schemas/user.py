import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr


class UserResponse(BaseModel):
    id: uuid.UUID
    email: EmailStr
    full_name: str | None
    avatar_url: str | None
    is_active: bool
    is_verified: bool
    mfa_enabled: bool
    current_organization_id: uuid.UUID | None
    created_at: datetime
    last_login_at: datetime | None

    model_config = {"from_attributes": True}


class UpdateProfileRequest(BaseModel):
    full_name: str | None = None
    avatar_url: str | None = None


class APIKeyCreate(BaseModel):
    name: str
    organization_id: uuid.UUID
    scopes: list[str] = ["read"]
    expires_days: int | None = None   # None = never expires


class APIKeyResponse(BaseModel):
    id: uuid.UUID
    name: str
    key_prefix: str
    scopes: list[str]
    is_active: bool
    expires_at: datetime | None
    last_used_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class APIKeyCreatedResponse(APIKeyResponse):
    key: str   # Full key shown ONCE at creation — never stored in plaintext
