import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr

from organization_service.models.membership import MemberRole


class InviteMemberRequest(BaseModel):
    email: EmailStr
    role: MemberRole = MemberRole.MEMBER


class UpdateMemberRoleRequest(BaseModel):
    role: MemberRole


class RemoveMemberRequest(BaseModel):
    reason: str


class MembershipResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    user_id: uuid.UUID
    user_email: str
    user_name: str | None = None
    role: str
    status: str
    joined_at: datetime

    model_config = {"from_attributes": True}


class InvitationResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    email: str
    role: str
    status: str
    expires_at: datetime
    created_at: datetime

    model_config = {"from_attributes": True}


class InvitationPreviewResponse(BaseModel):
    """Public-safe invitation metadata shown before the user accepts."""
    organization_id: uuid.UUID
    organization_name: str
    organization_slug: str
    invitee_email: str
    role: str
    expires_at: datetime
