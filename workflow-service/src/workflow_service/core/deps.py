import uuid
from dataclasses import dataclass

from fastapi import Header, HTTPException, status


@dataclass
class RequestContext:
    user_id: uuid.UUID
    org_id: uuid.UUID
    user_role: str
    user_email: str


async def get_request_context(
    x_user_id: str = Header(..., alias="X-User-ID"),
    x_org_id: str = Header(..., alias="X-Org-ID"),
    x_user_role: str = Header(default="member", alias="X-User-Role"),
    x_user_email: str = Header(default="", alias="X-User-Email"),
) -> RequestContext:
    try:
        return RequestContext(
            user_id=uuid.UUID(x_user_id),
            org_id=uuid.UUID(x_org_id) if x_org_id else None,
            user_role=x_user_role,
            user_email=x_user_email,
        )
    except (ValueError, AttributeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid request context",
        )
