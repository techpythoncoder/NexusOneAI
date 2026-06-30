import logging
import httpx
from auth_service.core.config import settings

logger = logging.getLogger(__name__)

async def get_admin_token() -> str:
    """Fetch access token for Keycloak Admin API from master realm."""
    url = f"{settings.KEYCLOAK_URL}/realms/master/protocol/openid-connect/token"
    data = {
        "client_id": settings.KEYCLOAK_ADMIN_CLIENT_ID,
        "username": settings.KEYCLOAK_ADMIN,
        "password": settings.KEYCLOAK_ADMIN_PASSWORD,
        "grant_type": "password",
    }
    async with httpx.AsyncClient() as client:
        resp = await client.post(url, data=data)
        if resp.status_code != 200:
            logger.error("Failed to fetch admin token: %s", resp.text)
            raise RuntimeError(f"Keycloak admin token fetch failed: {resp.text}")
        return resp.json()["access_token"]

async def ensure_central_client() -> None:
    """Ensure the central client 'nexusone-backend' in the 'nexusone' realm exists and is configured correctly."""
    try:
        token = await get_admin_token()
    except Exception as e:
        logger.error("Could not obtain Keycloak admin token: %s", str(e))
        return

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    
    url_clients = f"{settings.KEYCLOAK_URL}/admin/realms/{settings.KEYCLOAK_REALM}/clients"
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(url_clients, headers=headers)
            if resp.status_code != 200:
                logger.error("Failed to fetch clients from central realm: %s", resp.text)
                return
            
            clients = resp.json()
            target_client = next((c for c in clients if c.get("clientId") == settings.KEYCLOAK_CLIENT_ID), None)
            
            redirect_uris = [
                "http://localhost:8000/*",
                "http://localhost:8001/*",
                "http://localhost:8180/*",
                "http://keycloak:8080/*"
            ]
            
            if not target_client:
                logger.info("Creating missing central client %s in realm %s", settings.KEYCLOAK_CLIENT_ID, settings.KEYCLOAK_REALM)
                client_payload = {
                    "clientId": settings.KEYCLOAK_CLIENT_ID,
                    "name": "NexusOne Backend",
                    "enabled": True,
                    "clientAuthenticatorType": "client-secret",
                    "secret": settings.KEYCLOAK_CLIENT_SECRET,
                    "redirectUris": redirect_uris,
                    "webOrigins": ["*"],
                    "standardFlowEnabled": True,
                    "directAccessGrantsEnabled": True,
                    "serviceAccountsEnabled": True,
                    "protocol": "openid-connect",
                    "publicClient": False
                }
                create_resp = await client.post(url_clients, headers=headers, json=client_payload)
                if create_resp.status_code == 201:
                    logger.info("Successfully created central client %s", settings.KEYCLOAK_CLIENT_ID)
                else:
                    logger.error("Failed to create central client %s: %s", settings.KEYCLOAK_CLIENT_ID, create_resp.text)
            else:
                client_uuid = target_client["id"]
                current_redirects = target_client.get("redirectUris", [])
                
                updated = False
                for uri in redirect_uris:
                    if uri not in current_redirects:
                        current_redirects.append(uri)
                        updated = True
                
                if updated:
                    logger.info("Updating central client %s redirect URIs", settings.KEYCLOAK_CLIENT_ID)
                    url_update = f"{settings.KEYCLOAK_URL}/admin/realms/{settings.KEYCLOAK_REALM}/clients/{client_uuid}"
                    update_resp = await client.put(url_update, headers=headers, json={"redirectUris": current_redirects})
                    if update_resp.status_code not in (200, 204):
                        logger.error("Failed to update central client redirects: %s", update_resp.text)
                    else:
                        logger.info("Successfully updated central client redirect URIs for brokering")
        except Exception:
            logger.exception("Failed to verify/update central client redirects")

    # Sync central Identity Providers from env configuration
    await ensure_central_idps()


async def ensure_central_idps() -> None:
    """Ensure the central realm 'nexusone' has Google and GitHub Identity Providers matching the configuration."""
    try:
        token = await get_admin_token()
    except Exception as e:
        logger.error("Could not obtain Keycloak admin token: %s", str(e))
        return

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    
    async with httpx.AsyncClient() as client:
        # Check and update Google IDP
        if settings.GOOGLE_CLIENT_ID and not settings.GOOGLE_CLIENT_ID.startswith("mock-"):
            google_url = f"{settings.KEYCLOAK_URL}/admin/realms/{settings.KEYCLOAK_REALM}/identity-provider/instances/google"
            try:
                resp = await client.get(google_url, headers=headers)
                if resp.status_code == 200:
                    idp = resp.json()
                    config = idp.get("config", {})
                    if config.get("clientId") != settings.GOOGLE_CLIENT_ID:
                        logger.info("Updating central Google Identity Provider credentials")
                        config["clientId"] = settings.GOOGLE_CLIENT_ID
                        config["clientSecret"] = settings.GOOGLE_CLIENT_SECRET
                        update_resp = await client.put(google_url, headers=headers, json=idp)
                        if update_resp.status_code not in (200, 204):
                            logger.error("Failed to update central Google IDP: %s", update_resp.text)
                        else:
                            logger.info("Successfully updated central Google IDP")
            except Exception:
                logger.exception("Failed to verify/update central Google IDP")
                
        # Check and update GitHub IDP
        if settings.GITHUB_CLIENT_ID and not settings.GITHUB_CLIENT_ID.startswith("mock-"):
            github_url = f"{settings.KEYCLOAK_URL}/admin/realms/{settings.KEYCLOAK_REALM}/identity-provider/instances/github"
            try:
                resp = await client.get(github_url, headers=headers)
                if resp.status_code == 200:
                    idp = resp.json()
                    config = idp.get("config", {})
                    if config.get("clientId") != settings.GITHUB_CLIENT_ID:
                        logger.info("Updating central GitHub Identity Provider credentials")
                        config["clientId"] = settings.GITHUB_CLIENT_ID
                        config["clientSecret"] = settings.GITHUB_CLIENT_SECRET
                        update_resp = await client.put(github_url, headers=headers, json=idp)
                        if update_resp.status_code not in (200, 204):
                            logger.error("Failed to update central GitHub IDP: %s", update_resp.text)
                        else:
                            logger.info("Successfully updated central GitHub IDP")
            except Exception:
                logger.exception("Failed to verify/update central GitHub IDP")


async def create_tenant_realm(slug: str, display_name: str) -> None:
    """Dynamically provision a new Keycloak realm for a workspace with OIDC Identity Brokering to the central realm."""
    logger.info("Provisioning Keycloak realm: %s (%s)", slug, display_name)
    try:
        token = await get_admin_token()
    except Exception as e:
        logger.error("Could not obtain Keycloak admin token: %s", str(e))
        return

    # Ensure central client accepts redirects back to our broker endpoints
    await ensure_central_client()

    url = f"{settings.KEYCLOAK_URL}/admin/realms"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    
    realm_config = {
        "realm": slug,
        "displayName": display_name,
        "enabled": True,
        "registrationAllowed": False,
        "loginWithEmailAllowed": True,
        "duplicateEmailsAllowed": False,
        "resetPasswordAllowed": True,
        "editUsernameAllowed": False,
        "sslRequired": "none",
        "clients": [
            {
                "clientId": settings.KEYCLOAK_CLIENT_ID,
                "name": f"{display_name} Backend",
                "enabled": True,
                "clientAuthenticatorType": "client-secret",
                "secret": settings.KEYCLOAK_CLIENT_SECRET,
                "redirectUris": [
                    "http://localhost:8000/*",
                    "http://localhost:8001/*",
                    "http://*.localhost:3000/*",
                    "http://*.localhost:3002/*",
                    "http://*.nexusone.ai/*"
                ],
                "webOrigins": ["*"],
                "standardFlowEnabled": True,
                "directAccessGrantsEnabled": True,
                "serviceAccountsEnabled": True,
                "protocol": "openid-connect",
                "publicClient": False
            }
        ],
        "identityProviders": [
            {
                "alias": "google",
                "displayName": "Google",
                "providerId": "keycloak-oidc",
                "enabled": True,
                "config": {
                    "authorizationUrl": f"{settings.KEYCLOAK_PUBLIC_URL}/realms/{settings.KEYCLOAK_REALM}/protocol/openid-connect/auth?kc_idp_hint=google",
                    "tokenUrl": f"{settings.KEYCLOAK_URL}/realms/{settings.KEYCLOAK_REALM}/protocol/openid-connect/token",
                    "userInfoUrl": f"{settings.KEYCLOAK_URL}/realms/{settings.KEYCLOAK_REALM}/protocol/openid-connect/userinfo",
                    "jwksUrl": f"{settings.KEYCLOAK_URL}/realms/{settings.KEYCLOAK_REALM}/protocol/openid-connect/certs",
                    "logoutUrl": f"{settings.KEYCLOAK_PUBLIC_URL}/realms/{settings.KEYCLOAK_REALM}/protocol/openid-connect/logout",
                    "clientId": settings.KEYCLOAK_CLIENT_ID,
                    "clientSecret": settings.KEYCLOAK_CLIENT_SECRET,
                    "syncMode": "IMPORT",
                    "useJwksUrl": "true"
                }
            },
            {
                "alias": "github",
                "displayName": "GitHub",
                "providerId": "keycloak-oidc",
                "enabled": True,
                "config": {
                    "authorizationUrl": f"{settings.KEYCLOAK_PUBLIC_URL}/realms/{settings.KEYCLOAK_REALM}/protocol/openid-connect/auth?kc_idp_hint=github",
                    "tokenUrl": f"{settings.KEYCLOAK_URL}/realms/{settings.KEYCLOAK_REALM}/protocol/openid-connect/token",
                    "userInfoUrl": f"{settings.KEYCLOAK_URL}/realms/{settings.KEYCLOAK_REALM}/protocol/openid-connect/userinfo",
                    "jwksUrl": f"{settings.KEYCLOAK_URL}/realms/{settings.KEYCLOAK_REALM}/protocol/openid-connect/certs",
                    "logoutUrl": f"{settings.KEYCLOAK_PUBLIC_URL}/realms/{settings.KEYCLOAK_REALM}/protocol/openid-connect/logout",
                    "clientId": settings.KEYCLOAK_CLIENT_ID,
                    "clientSecret": settings.KEYCLOAK_CLIENT_SECRET,
                    "syncMode": "IMPORT",
                    "useJwksUrl": "true"
                }
            }
        ]
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(url, headers=headers, json=realm_config)
        if resp.status_code == 201:
            logger.info("Successfully created Keycloak realm: %s", slug)
        elif resp.status_code == 409:
            logger.warning("Keycloak realm %s already exists", slug)
        else:
            logger.error("Failed to create Keycloak realm %s: %s", slug, resp.text)


async def create_keycloak_user(realm: str, email: str, full_name: str | None) -> None:
    """Create a user in a specific Keycloak realm."""
    logger.info("Provisioning Keycloak user %s in realm %s", email, realm)
    try:
        token = await get_admin_token()
    except Exception as e:
        logger.error("Could not obtain Keycloak admin token: %s", str(e))
        return

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    first_name = ""
    last_name = ""
    if full_name:
        parts = full_name.split(" ", 1)
        first_name = parts[0]
        if len(parts) > 1:
            last_name = parts[1]

    payload = {
        "username": email,
        "email": email,
        "enabled": True,
        "emailVerified": True,
        "firstName": first_name,
        "lastName": last_name,
    }

    url = f"{settings.KEYCLOAK_URL}/admin/realms/{realm}/users"
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(url, headers=headers, json=payload)
            if resp.status_code == 201:
                logger.info("Successfully created Keycloak user %s in realm %s", email, realm)
            elif resp.status_code == 409:
                logger.warning("Keycloak user %s already exists in realm %s", email, realm)
            else:
                logger.error("Failed to create Keycloak user %s in realm %s: %s", email, realm, resp.text)
        except Exception:
            logger.exception("Failed to connect to Keycloak when creating user %s in realm %s", email, realm)
