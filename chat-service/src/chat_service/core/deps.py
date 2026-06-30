import uuid
from dataclasses import dataclass
from fastapi import Header, HTTPException, Query, status
from jose import JWTError, jwt

from chat_service.core.config import settings


@dataclass
class RequestContext:
    user_id: uuid.UUID
    org_id: uuid.UUID | None
    user_role: str
    user_email: str


async def get_request_context(
    x_user_id: str = Header(..., alias="X-User-ID"),
    x_org_id: str = Header(default="", alias="X-Org-ID"),
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
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid request context")


async def get_ws_context(
    token: str = Query(...),
    org_id: str = Query(default=""),
) -> RequestContext:
    """WebSocket connections pass the JWT as ?token= since browsers can't set Authorization headers."""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")
        user_id = uuid.UUID(payload["sub"])
        user_email = payload.get("email", "")
        user_role = payload.get("role", "member")
        resolved_org = (
            uuid.UUID(org_id) if org_id
            else (uuid.UUID(payload["org_id"]) if payload.get("org_id") else None)
        )
        return RequestContext(user_id=user_id, org_id=resolved_org, user_role=user_role, user_email=user_email)
    except (JWTError, KeyError, ValueError, AttributeError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
