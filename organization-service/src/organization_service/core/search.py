import asyncio
import logging

import httpx

SEARCH_BASE = "http://nexus-search:8006"
logger = logging.getLogger(__name__)


async def _call(method: str, path: str, **kwargs) -> None:
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            await client.request(method, f"{SEARCH_BASE}{path}", **kwargs)
    except Exception as exc:
        logger.warning("search index call failed: %s", exc)


def index_member(user_id: str, org_id: str, email: str, name: str | None, role: str) -> None:
    asyncio.ensure_future(_call(
        "POST", "/api/v1/search/index",
        headers={"X-User-ID": user_id, "X-Org-ID": org_id},
        json={"resource_type": "members", "doc_id": f"{org_id}:{user_id}",
              "body": {"user_id": user_id, "email": email, "name": name or "",
                       "role": role, "organization_id": org_id}},
    ))


def delete_member(user_id: str, org_id: str) -> None:
    asyncio.ensure_future(_call(
        "DELETE", f"/api/v1/search/index/members/{org_id}:{user_id}",
        headers={"X-User-ID": user_id, "X-Org-ID": org_id},
    ))
