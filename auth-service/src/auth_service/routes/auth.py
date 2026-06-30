"""
Auth routes — login, register, token refresh, token validation, logout.

The /validate endpoint is the key one — nginx auth_request calls it before
every protected request. It decodes the JWT and returns user info as
response headers so nginx can inject them into the upstream request.
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, Request, Response
from pydantic import BaseModel
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from auth_service.core.config import settings
from auth_service.core.database import get_db
from auth_service.core.exceptions import AuthError
from auth_service.core.kafka import publish_user_event
from auth_service.core.redis import revoke_all_user_tokens, store_refresh_token
from auth_service.models.refresh_token import RefreshToken
from auth_service.schemas.auth import (
    LoginRequest,
    MFASetupResponse,
    MFAVerifyRequest,
    PasswordResetConfirm,
    PasswordResetRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
    ValidateResponse,
)
from auth_service.schemas.user import UserResponse
from auth_service.services import jwt_service, user_service
from auth_service.services.oauth_service import (
    handle_github_callback,
    handle_google_callback,
)
from auth_service.services.keycloak_oauth_service import (
    get_keycloak_authorize_url,
    handle_keycloak_callback,
)
from auth_service.services.keycloak_admin_service import create_keycloak_user

import secrets
import pyotp
import qrcode
import io
import base64

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


# ── Registration & Email Verification ────────────────────────────────────────

@router.post("/register", response_model=UserResponse, status_code=201)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    user = await user_service.create_user(db, body.email, body.password, body.full_name)
    await create_keycloak_user(settings.KEYCLOAK_REALM, user.email, user.full_name)
    await publish_user_event("user.registered", {
        "user_id": str(user.id),
        "email": user.email,
        "full_name": user.full_name,
        "verification_token": user.verification_token,
    })
    return user


@router.get("/verify-email")
async def verify_email(token: str, db: AsyncSession = Depends(get_db)):
    user = await user_service.verify_email(db, token)
    await publish_user_event("user.email_verified", {"user_id": str(user.id), "email": user.email})
    return {"message": "Email verified successfully"}


# ── Login / Logout ────────────────────────────────────────────────────────────

@router.post("/login", response_model=TokenResponse)
async def login(
    body: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    user = await user_service.authenticate_user(db, body.email, body.password)

    # MFA check — if enabled, TOTP code is required
    if user.mfa_enabled:
        if not body.totp_code:
            raise AuthError("MFA code required")
        totp = pyotp.TOTP(user.mfa_secret)
        if not totp.verify(body.totp_code, valid_window=1):
            raise AuthError("Invalid MFA code")

    access_token, access_jti = jwt_service.create_access_token(
        user_id=user.id,
        org_id=user.current_organization_id,
        email=user.email,
        full_name=user.full_name,
    )
    refresh_token, refresh_jti = jwt_service.create_refresh_token(user_id=user.id)

    # Store refresh token in Postgres (audit) and Redis (fast revocation)

    refresh_ttl = settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS * 86400
    db.add(RefreshToken(
        jti=refresh_jti,
        user_id=user.id,
        user_agent=request.headers.get("User-Agent"),
        ip_address=request.client.host if request.client else None,
        expires_at=datetime.now(timezone.utc).replace(
            second=0, microsecond=0
        ).__class__.fromtimestamp(
            datetime.now(timezone.utc).timestamp() + refresh_ttl, tz=timezone.utc
        ),
    ))
    await store_refresh_token(str(user.id), refresh_jti, refresh_ttl)

    user.last_login_at = datetime.now(timezone.utc)

    await publish_user_event("user.logged_in", {
        "user_id": str(user.id),
        "ip": request.client.host if request.client else None,
    })

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/logout")
async def logout(
    authorization: str = Header(None),
    db: AsyncSession = Depends(get_db),
):
    if not authorization or not authorization.startswith("Bearer "):
        return {"message": "Logged out"}
    token = authorization.removeprefix("Bearer ")
    try:
        payload = await jwt_service.decode_access_token(token)
        await revoke_all_user_tokens(payload["sub"])
    except AuthError:
        pass   # Already invalid — still return success
    return {"message": "Logged out successfully"}


# ── Token Refresh ─────────────────────────────────────────────────────────────

@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(body: RefreshRequest, db: AsyncSession = Depends(get_db)):

    payload = await jwt_service.decode_refresh_token(body.refresh_token)
    user_id = uuid.UUID(payload["sub"])

    user = await user_service.get_user_by_id(db, user_id)
    if not user or not user.is_active:
        raise AuthError("User account not found or deactivated")

    # Rotate — revoke old refresh token
    await jwt_service.revoke_token(payload["jti"], settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS * 86400)

    access_token, _ = jwt_service.create_access_token(
        user_id=user.id,
        org_id=user.current_organization_id,
        email=user.email,
    )
    new_refresh_token, new_refresh_jti = jwt_service.create_refresh_token(user_id=user.id)
    refresh_ttl = settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS * 86400
    await store_refresh_token(str(user.id), new_refresh_jti, refresh_ttl)

    return TokenResponse(
        access_token=access_token,
        refresh_token=new_refresh_token,
        expires_in=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


# ── Org Switching ─────────────────────────────────────────────────────────────

class SwitchOrgRequest(BaseModel):
    org_id: uuid.UUID | None   # None = clear active org


@router.post("/switch-org", response_model=TokenResponse)
async def switch_org(
    body: SwitchOrgRequest,
    authorization: str = Header(None),
    db: AsyncSession = Depends(get_db),
):
    """
    Switch the caller's active organization.
    Updates current_organization_id on the user record and returns a
    fresh access token with the new org_id embedded.
    The frontend must replace its stored token with this new one.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise AuthError("Missing authorization header")
    payload = await jwt_service.decode_access_token(authorization.removeprefix("Bearer "))
    user_id = uuid.UUID(payload["sub"])
    user = await user_service.get_user_by_id(db, user_id)
    if not user:
        raise AuthError("User not found")

    user.current_organization_id = body.org_id
    await db.commit()

    access_token, _ = jwt_service.create_access_token(
        user_id=user.id,
        org_id=user.current_organization_id,
        email=user.email,
    )
    refresh_token_val, refresh_jti = jwt_service.create_refresh_token(user_id=user.id)
    refresh_ttl = settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS * 86400
    await store_refresh_token(str(user.id), refresh_jti, refresh_ttl)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token_val,
        expires_in=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


# ── Token Validation (called by nginx auth_request) ──────────────────────────

@router.get("/validate")
async def validate_token(
    response: Response,
    authorization: str = Header(None),
):
    """
    Called internally by nginx auth_request before every protected route.

    Returns 200 with user info injected as response headers, OR 401.
    Nginx reads X-User-ID, X-Org-ID, X-User-Role, X-User-Email from the
    response headers and forwards them to the upstream service.

    This endpoint is intentionally fast — no DB call, just JWT decode + Redis check.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise AuthError("Missing authorization header")

    token = authorization.removeprefix("Bearer ")
    payload = await jwt_service.decode_access_token(token)

    # Inject user info as response headers — nginx reads these
    response.headers["X-User-ID"]        = payload["sub"]
    response.headers["X-Org-ID"]         = payload.get("org_id") or ""
    response.headers["X-User-Role"]      = payload.get("role", "member")
    response.headers["X-User-Email"]     = payload.get("email", "")
    response.headers["X-User-Full-Name"] = payload.get("full_name", "")

    return {"valid": True}


# ── Password Reset ────────────────────────────────────────────────────────────

@router.post("/password-reset/request")
async def request_password_reset(
    body: PasswordResetRequest,
    db: AsyncSession = Depends(get_db),
):
    user = await user_service.get_user_by_email(db, body.email)
    if user:
        reset_token = secrets.token_urlsafe(32)
        from datetime import timedelta
        user.password_reset_token = reset_token
        user.password_reset_expires = datetime.now(timezone.utc) + timedelta(hours=1)
        await publish_user_event("user.password_reset_requested", {
            "user_id": str(user.id),
            "email": user.email,
            "reset_token": reset_token,
        })
    # Always return success — don't reveal whether email exists
    return {"message": "If this email is registered, a reset link has been sent"}


@router.post("/password-reset/confirm")
async def confirm_password_reset(
    body: PasswordResetConfirm,
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import select
    from auth_service.models.user import User
    result = await db.execute(
        select(User).where(
            User.password_reset_token == body.token,
            User.password_reset_expires > datetime.now(timezone.utc),
        )
    )
    user = result.scalar_one_or_none()
    if not user:
        raise AuthError("Invalid or expired reset token")

    from passlib.context import CryptContext
    ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
    user.hashed_password = ctx.hash(body.new_password)
    user.password_reset_token = None
    user.password_reset_expires = None
    await revoke_all_user_tokens(str(user.id))
    return {"message": "Password reset successfully"}


# ── MFA ───────────────────────────────────────────────────────────────────────

@router.post("/mfa/setup", response_model=MFASetupResponse)
async def setup_mfa(
    authorization: str = Header(None),
    db: AsyncSession = Depends(get_db),
):
    if not authorization or not authorization.startswith("Bearer "):
        raise AuthError("Missing authorization header")
    payload = await jwt_service.decode_access_token(authorization.removeprefix("Bearer "))
    user = await user_service.get_user_by_id(db, uuid.UUID(payload["sub"]))
    if not user:
        raise AuthError("User not found")

    secret = pyotp.random_base32()
    user.mfa_secret = secret
    await db.commit()
    totp = pyotp.TOTP(secret)
    uri = totp.provisioning_uri(name=user.email, issuer_name="NexusOne AI")
    return MFASetupResponse(secret=secret, qr_code_uri=uri)


@router.post("/mfa/verify")
async def verify_mfa(
    body: MFAVerifyRequest,
    authorization: str = Header(None),
    db: AsyncSession = Depends(get_db),
):
    if not authorization or not authorization.startswith("Bearer "):
        raise AuthError("Missing authorization header")
    payload = await jwt_service.decode_access_token(authorization.removeprefix("Bearer "))
    user = await user_service.get_user_by_id(db, uuid.UUID(payload["sub"]))
    if not user or not user.mfa_secret:
        raise AuthError("MFA not set up")

    totp = pyotp.TOTP(user.mfa_secret)
    if not totp.verify(body.totp_code, valid_window=1):
        raise AuthError("Invalid MFA code")

    user.mfa_enabled = True
    await db.commit()
    return {"message": "MFA enabled successfully"}


@router.post("/mfa/disable")
async def disable_mfa(
    body: MFAVerifyRequest,
    authorization: str = Header(None),
    db: AsyncSession = Depends(get_db),
):
    if not authorization or not authorization.startswith("Bearer "):
        raise AuthError("Missing authorization header")
    payload = await jwt_service.decode_access_token(authorization.removeprefix("Bearer "))
    user = await user_service.get_user_by_id(db, uuid.UUID(payload["sub"]))
    if not user or not user.mfa_enabled or not user.mfa_secret:
        raise AuthError("MFA is not enabled")

    totp = pyotp.TOTP(user.mfa_secret)
    if not totp.verify(body.totp_code, valid_window=1):
        raise AuthError("Invalid MFA code")

    user.mfa_enabled = False
    user.mfa_secret = None
    await db.commit()
    return {"message": "MFA disabled successfully"}


# ── OAuth via Keycloak ────────────────────────────────────────────────────────
# All social OAuth (Google, GitHub) is routed through Keycloak.
# kc_idp_hint tells Keycloak to skip its own login page and go directly to the provider.
# State encodes the provider so the single callback knows which one to use.

@router.get("/oauth/google/authorize")
async def google_authorize(tenant: str = None):
    state = f"google:{tenant or ''}:{secrets.token_urlsafe(16)}"
    url = get_keycloak_authorize_url(state=state, provider="google")
    return RedirectResponse(url)


@router.get("/oauth/github/authorize")
async def github_authorize(tenant: str = None):
    state = f"github:{tenant or ''}:{secrets.token_urlsafe(16)}"
    url = get_keycloak_authorize_url(state=state, provider="github")
    return RedirectResponse(url)


@router.get("/oauth/keycloak/callback")
async def keycloak_callback(code: str, state: str = "", db: AsyncSession = Depends(get_db)):
    parts = state.split(":")
    provider = parts[0] if len(parts) > 0 else "keycloak"
    tenant = parts[1] if len(parts) > 1 and parts[1] != "" else None

    user = await handle_keycloak_callback(db, code, provider)
    access_token, _ = jwt_service.create_access_token(
        user_id=user.id, org_id=user.current_organization_id, email=user.email
    )
    refresh_token, refresh_jti = jwt_service.create_refresh_token(user_id=user.id)
    refresh_ttl = settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS * 86400
    await store_refresh_token(str(user.id), refresh_jti, refresh_ttl)

    # Dynamically build tenant-specific frontend URL
    from urllib.parse import urlparse, urlunparse
    parsed = urlparse(settings.FRONTEND_URL)
    if tenant:
        netloc = parsed.netloc
        if ":" in netloc:
            host, port = netloc.split(":")
            netloc = f"{tenant}.{host}:{port}"
        else:
            netloc = f"{tenant}.{netloc}"
        parsed = parsed._replace(netloc=netloc)

    frontend_base = urlunparse(parsed)
    redirect_url = f"{frontend_base}/auth/callback?access_token={access_token}&refresh_token={refresh_token}"
    return RedirectResponse(redirect_url)


# ── OAuth direct (fallback, kept for reference) ───────────────────────────────

@router.get("/oauth/google/callback")
async def google_callback(code: str, db: AsyncSession = Depends(get_db)):
    user = await handle_google_callback(db, code)
    access_token, _ = jwt_service.create_access_token(
        user_id=user.id, org_id=user.current_organization_id, email=user.email
    )
    refresh_token, refresh_jti = jwt_service.create_refresh_token(user_id=user.id)
    refresh_ttl = settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS * 86400
    await store_refresh_token(str(user.id), refresh_jti, refresh_ttl)
    redirect_url = f"{settings.FRONTEND_URL}/auth/callback?access_token={access_token}&refresh_token={refresh_token}"
    return RedirectResponse(redirect_url)


@router.get("/oauth/github/callback")
async def github_callback(code: str, db: AsyncSession = Depends(get_db)):
    user = await handle_github_callback(db, code)
    access_token, _ = jwt_service.create_access_token(
        user_id=user.id, org_id=user.current_organization_id, email=user.email
    )
    refresh_token, refresh_jti = jwt_service.create_refresh_token(user_id=user.id)
    refresh_ttl = settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS * 86400
    await store_refresh_token(str(user.id), refresh_jti, refresh_ttl)
    redirect_url = f"{settings.FRONTEND_URL}/auth/callback?access_token={access_token}&refresh_token={refresh_token}"
    return RedirectResponse(redirect_url)
