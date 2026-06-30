"""
Fire-and-forget helpers to keep the search-service index in sync.
Failures are logged and swallowed — search is non-critical.
"""
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


def index_project(project_id: str, org_id: str, name: str, description: str | None) -> None:
    asyncio.ensure_future(_call(
        "POST", "/api/v1/search/index",
        headers={"X-User-ID": "00000000-0000-0000-0000-000000000000",
                 "X-Org-ID": org_id},
        json={"resource_type": "projects", "doc_id": project_id,
              "body": {"name": name, "description": description or "", "organization_id": org_id}},
    ))


def index_task(
    task_id: str, project_id: str, org_id: str,
    title: str, description: str | None,
    status: str | None = None, priority: str | None = None,
) -> None:
    asyncio.ensure_future(_call(
        "POST", "/api/v1/search/index",
        headers={"X-User-ID": "00000000-0000-0000-0000-000000000000",
                 "X-Org-ID": org_id},
        json={"resource_type": "tasks", "doc_id": task_id,
              "body": {"title": title, "description": description or "",
                       "status": (status or "").lower(),
                       "priority": (priority or "").lower(),
                       "project_id": project_id, "organization_id": org_id}},
    ))


def index_comment(comment_id: str, task_id: str, project_id: str, org_id: str, content: str, author_email: str) -> None:
    asyncio.ensure_future(_call(
        "POST", "/api/v1/search/index",
        headers={"X-User-ID": "00000000-0000-0000-0000-000000000000",
                 "X-Org-ID": org_id},
        json={"resource_type": "comments", "doc_id": comment_id,
              "body": {"content": content, "author_email": author_email,
                       "task_id": task_id, "project_id": project_id, "organization_id": org_id}},
    ))


def delete_from_index(resource_type: str, doc_id: str, org_id: str) -> None:
    asyncio.ensure_future(_call(
        "DELETE", f"/api/v1/search/index/{resource_type}/{doc_id}",
        headers={"X-User-ID": "00000000-0000-0000-0000-000000000000",
                 "X-Org-ID": org_id},
    ))
