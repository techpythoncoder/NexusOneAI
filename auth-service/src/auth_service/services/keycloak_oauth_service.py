"""
Keycloak OAuth service.

Flow:
  1. /oauth/google/authorize  → redirect to Keycloak with kc_idp_hint=google
  2. /oauth/github/authorize  → redirect to Keycloak with kc_idp_hint=github
  3. Keycloak handles the provider dance, redirects back to /oauth/keycloak/callback
  4. We exchange the code with Keycloak, decode the id_token JWT, upsert user + return JWT
"""

import base64
import json
from urllib.parse import urlencode

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from auth_service.core.config import settings
from auth_service.core.exceptions import AuthError
from auth_service.services.oauth_service import _upsert_oauth_user


def _decode_jwt_payload(token: str) -> dict:
    """Decode JWT payload without signature verification (we trust Keycloak directly)."""
    try:
        payload = token.split(".")[1]
        payload += "=" * (4 - len(payload) % 4)
        return json.loads(base64.urlsafe_b64decode(payload))
    except Exception:
        return {}


def get_keycloak_authorize_url(state: str, provider: str, _tenant: str = None) -> str:
    """Build Keycloak authorization URL. kc_idp_hint skips Keycloak login page.

    Social OAuth (Google/GitHub) always routes through the hub realm (nexusone)
    which holds the real provider credentials. The tenant is embedded in `state`
    so the callback can redirect to the correct subdomain afterwards.
    Tenant-specific realms are only used for password-based logins, not brokering.
    """
    params = {
        "client_id": settings.KEYCLOAK_CLIENT_ID,
        "redirect_uri": settings.KEYCLOAK_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "kc_idp_hint": provider,
    }
    base = f"{settings.KEYCLOAK_PUBLIC_URL}/realms/{settings.KEYCLOAK_REALM}/protocol/openid-connect/auth"
    return f"{base}?{urlencode(params)}"


async def handle_keycloak_callback(db: AsyncSession, code: str, provider: str, _tenant: str = None) -> object:
    """Exchange Keycloak auth code, decode id_token, upsert User record.

    Token exchange always hits the hub realm — social auth flows only ever
    issue codes against nexusone, not tenant realms.
    """
    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            f"{settings.KEYCLOAK_URL}/realms/{settings.KEYCLOAK_REALM}/protocol/openid-connect/token",
            data={
                "grant_type": "authorization_code",
                "client_id": settings.KEYCLOAK_CLIENT_ID,
                "client_secret": settings.KEYCLOAK_CLIENT_SECRET,
                "redirect_uri": settings.KEYCLOAK_REDIRECT_URI,
                "code": code,
            },
        )
        if token_resp.status_code != 200:
            raise AuthError(f"Keycloak token exchange failed: {token_resp.text}")
        token_data = token_resp.json()

    # Decode the id_token JWT directly — avoids a second round-trip and the
    # 401 that Keycloak 24 returns on the userinfo endpoint for this flow.
    id_token = token_data.get("id_token") or token_data.get("access_token", "")
    userinfo = _decode_jwt_payload(id_token)

    if not userinfo.get("email"):
        raise AuthError("No email returned from Keycloak — ensure email scope is granted")

    return await _upsert_oauth_user(
        db,
        provider=provider,
        provider_user_id=userinfo.get("sub", ""),
        provider_email=userinfo.get("email"),
        full_name=userinfo.get("name"),
        avatar_url=userinfo.get("picture"),
        access_token=token_data.get("access_token"),
        refresh_token=token_data.get("refresh_token"),
    )
