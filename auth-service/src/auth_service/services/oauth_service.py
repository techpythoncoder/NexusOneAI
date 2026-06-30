"""
OAuth2 service — handles Google and GitHub provider flows.

Flow:
  1. Client calls GET /auth/oauth/{provider}/authorize → redirect URL
  2. User authenticates with provider
  3. Provider redirects to GET /auth/oauth/{provider}/callback?code=...
  4. We exchange code for tokens, fetch user profile, upsert User + OAuthAccount
  5. Return our own JWT pair (same as regular login)
"""

import secrets
import uuid

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth_service.core.config import settings
from auth_service.core.exceptions import AuthError
from auth_service.core.kafka import publish_user_event
from auth_service.models.oauth_account import OAuthAccount
from auth_service.models.user import User


async def get_google_authorize_url(state: str) -> str:
    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "access_type": "offline",
        "prompt": "consent",
    }
    qs = "&".join(f"{k}={v}" for k, v in params.items())
    return f"https://accounts.google.com/o/oauth2/v2/auth?{qs}"


async def handle_google_callback(db: AsyncSession, code: str) -> User:
    async with httpx.AsyncClient() as client:
        # Exchange code for tokens
        token_resp = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "redirect_uri": settings.GOOGLE_REDIRECT_URI,
                "grant_type": "authorization_code",
                "code": code,
            },
        )
        if token_resp.status_code != 200:
            raise AuthError("Google OAuth token exchange failed")
        token_data = token_resp.json()

        # Fetch user profile
        user_resp = await client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {token_data['access_token']}"},
        )
        if user_resp.status_code != 200:
            raise AuthError("Failed to fetch Google profile")
        profile = user_resp.json()

    return await _upsert_oauth_user(
        db,
        provider="google",
        provider_user_id=profile["id"],
        provider_email=profile.get("email"),
        full_name=profile.get("name"),
        avatar_url=profile.get("picture"),
        access_token=token_data.get("access_token"),
        refresh_token=token_data.get("refresh_token"),
    )


async def get_github_authorize_url(state: str) -> str:
    params = {
        "client_id": settings.GITHUB_CLIENT_ID,
        "redirect_uri": settings.GITHUB_REDIRECT_URI,
        "scope": "user:email read:user",
        "state": state,
    }
    qs = "&".join(f"{k}={v}" for k, v in params.items())
    return f"https://github.com/login/oauth/authorize?{qs}"


async def handle_github_callback(db: AsyncSession, code: str) -> User:
    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            "https://github.com/login/oauth/access_token",
            data={
                "client_id": settings.GITHUB_CLIENT_ID,
                "client_secret": settings.GITHUB_CLIENT_SECRET,
                "redirect_uri": settings.GITHUB_REDIRECT_URI,
                "code": code,
            },
            headers={"Accept": "application/json"},
        )
        if token_resp.status_code != 200:
            raise AuthError("GitHub OAuth token exchange failed")
        token_data = token_resp.json()
        access_token = token_data.get("access_token")

        user_resp = await client.get(
            "https://api.github.com/user",
            headers={"Authorization": f"Bearer {access_token}", "Accept": "application/vnd.github+json"},
        )
        profile = user_resp.json()

        # GitHub may not include email — fetch separately
        email = profile.get("email")
        if not email:
            emails_resp = await client.get(
                "https://api.github.com/user/emails",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            emails = emails_resp.json()
            primary = next((e for e in emails if e.get("primary") and e.get("verified")), None)
            email = primary["email"] if primary else None

    return await _upsert_oauth_user(
        db,
        provider="github",
        provider_user_id=str(profile["id"]),
        provider_email=email,
        full_name=profile.get("name"),
        avatar_url=profile.get("avatar_url"),
        access_token=access_token,
        refresh_token=None,
    )


async def _upsert_oauth_user(
    db: AsyncSession,
    *,
    provider: str,
    provider_user_id: str,
    provider_email: str | None,
    full_name: str | None,
    avatar_url: str | None,
    access_token: str | None,
    refresh_token: str | None,
) -> User:
    # Check if this OAuth account is already linked
    result = await db.execute(
        select(OAuthAccount).where(
            OAuthAccount.provider == provider,
            OAuthAccount.provider_user_id == provider_user_id,
        )
    )
    oauth_account = result.scalar_one_or_none()

    if oauth_account:
        # Update tokens and return existing user
        oauth_account.access_token = access_token
        oauth_account.refresh_token = refresh_token
        user_result = await db.execute(select(User).where(User.id == oauth_account.user_id))
        return user_result.scalar_one()

    # Try to find existing user by email (link accounts)
    user = None
    if provider_email:
        user_result = await db.execute(select(User).where(User.email == provider_email.lower()))
        user = user_result.scalar_one_or_none()

    if not user:
        if not provider_email:
            raise AuthError(f"{provider.title()} account has no verified email address")
        user = User(
            email=provider_email.lower(),
            full_name=full_name,
            avatar_url=avatar_url,
            is_verified=True,   # OAuth email is already verified by provider
        )
        db.add(user)
        await db.flush()
        await publish_user_event("user.registered", {
            "user_id": str(user.id),
            "email": user.email,
            "full_name": user.full_name or "",
        })

    new_oauth = OAuthAccount(
        user_id=user.id,
        provider=provider,
        provider_user_id=provider_user_id,
        provider_email=provider_email,
        access_token=access_token,
        refresh_token=refresh_token,
    )
    db.add(new_oauth)
    await db.flush()
    return user
