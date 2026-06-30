"""
JWT service — creates and validates access/refresh tokens.

Access token  → short-lived (15 min), validated on every request via nginx auth_request
Refresh token → long-lived (30 days), used only at /auth/refresh to get new access token
"""

import uuid
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt

from auth_service.core.config import settings
from auth_service.core.exceptions import AuthError
from auth_service.core.redis import blacklist_token, is_token_blacklisted


def _now() -> datetime:
    return datetime.now(timezone.utc)


def create_access_token(
    user_id: uuid.UUID,
    org_id: uuid.UUID | None,
    email: str,
    role: str = "member",
    full_name: str | None = None,
) -> tuple[str, str]:
    """Returns (encoded_jwt, jti)."""
    jti = str(uuid.uuid4())
    expires = _now() + timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": str(user_id),
        "email": email,
        "org_id": str(org_id) if org_id else None,
        "role": role,
        "jti": jti,
        "iat": _now(),
        "exp": expires,
        "type": "access",
        "full_name": full_name or "",
    }
    token = jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return token, jti


def create_refresh_token(user_id: uuid.UUID) -> tuple[str, str]:
    """Returns (encoded_jwt, jti)."""
    jti = str(uuid.uuid4())
    expires = _now() + timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS)
    payload = {
        "sub": str(user_id),
        "jti": jti,
        "iat": _now(),
        "exp": expires,
        "type": "refresh",
    }
    token = jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return token, jti


async def decode_access_token(token: str) -> dict:
    """Decode and validate an access token. Raises AuthError on any failure."""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError as exc:
        raise AuthError("Invalid or expired token") from exc

    if payload.get("type") != "access":
        raise AuthError("Token type mismatch")

    jti = payload.get("jti")
    if jti and await is_token_blacklisted(jti):
        raise AuthError("Token has been revoked")

    return payload


async def decode_refresh_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError as exc:
        raise AuthError("Invalid or expired refresh token") from exc

    if payload.get("type") != "refresh":
        raise AuthError("Token type mismatch")

    jti = payload.get("jti")
    if jti and await is_token_blacklisted(jti):
        raise AuthError("Refresh token has been revoked")

    return payload


async def revoke_token(jti: str, ttl_seconds: int) -> None:
    await blacklist_token(jti, ttl_seconds)
