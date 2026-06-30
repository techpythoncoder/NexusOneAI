"""
Request context helpers for organization-service.

Because nginx validates JWTs and injects X-User-ID / X-Org-ID headers,
this service never touches JWT libraries. It just reads the four headers
that nginx guarantees are present on every authenticated request.
"""

import uuid
from dataclasses import dataclass

from fastapi import Header, HTTPException, status


@dataclass
class RequestContext:
    user_id: uuid.UUID
    org_id: uuid.UUID | None
    user_role: str
    user_email: str
    user_name: str


async def get_request_context(
    x_user_id: str = Header(..., alias="X-User-ID"),
    x_org_id: str = Header(default="", alias="X-Org-ID"),
    x_user_role: str = Header(default="member", alias="X-User-Role"),
    x_user_email: str = Header(default="", alias="X-User-Email"),
    x_user_full_name: str = Header(default="", alias="X-User-Full-Name"),
) -> RequestContext:
    """
    Dependency injected into every protected route.
    Nginx guarantees these headers exist — if they're missing something is
    very wrong (request bypassed the gateway), so we 401.
    """
    try:
        return RequestContext(
            user_id=uuid.UUID(x_user_id),
            org_id=uuid.UUID(x_org_id) if x_org_id else None,
            user_role=x_user_role,
            user_email=x_user_email,
            user_name=x_user_full_name,
        )
    except (ValueError, AttributeError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid request context")


def require_role(*allowed_roles: str):
    """Returns a dependency that raises 403 if the user's role is not in allowed_roles."""
    async def check(ctx: RequestContext = get_request_context):
        if ctx.user_role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{ctx.user_role}' cannot perform this action",
            )
        return ctx
    return check
