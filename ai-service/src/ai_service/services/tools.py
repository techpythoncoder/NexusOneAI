"""
Workspace tools and tool execution routing for AI Assistant.
"""

import json
import logging
import httpx
from ai_service.core.config import settings
from ai_service.core.deps import RequestContext

logger = logging.getLogger(__name__)

# List of tools to register with Groq
WORKSPACE_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "list_organization_members",
            "description": "Retrieve the list of members (names, emails, roles, and statuses) in the current organization.",
            "parameters": {
                "type": "object",
                "properties": {},
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "list_projects",
            "description": "Retrieve the list of projects (name, key, description, status) in the current organization.",
            "parameters": {
                "type": "object",
                "properties": {},
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "list_project_tasks",
            "description": "Retrieve all tasks for a specific project by its project UUID.",
            "parameters": {
                "type": "object",
                "properties": {
                    "project_id": {
                        "type": "string",
                        "description": "The UUID of the project to retrieve tasks for."
                    }
                },
                "required": ["project_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_project_task",
            "description": "Create a new task inside a specific project and optionally assign it to an organization member.",
            "parameters": {
                "type": "object",
                "properties": {
                    "project_id": {
                        "type": "string",
                        "description": "The UUID of the project where the task will be created."
                    },
                    "title": {
                        "type": "string",
                        "description": "The title of the task."
                    },
                    "description": {
                        "type": "string",
                        "description": "Optional detailed description of the task."
                    },
                    "priority": {
                        "type": "string",
                        "enum": ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
                        "description": "The priority level of the task. Defaults to MEDIUM."
                    },
                    "assignee_id": {
                        "type": "string",
                        "description": "Optional UUID of the organization member to assign the task to."
                    }
                },
                "required": ["project_id", "title"]
            }
        }
    }
]


async def execute_tool(name: str, args: dict, ctx: RequestContext) -> dict:
    """Execute one of the registered workspace tools using microservice HTTP APIs."""
    headers = {
        "X-User-ID": str(ctx.user_id),
        "X-User-Email": ctx.user_email,
        "X-User-Role": ctx.user_role,
        "X-Org-ID": str(ctx.org_id) if ctx.org_id else "",
    }
    
    logger.info("Executing AI tool: %s with args: %s", name, args)

    async with httpx.AsyncClient(timeout=5.0) as client:
        try:
            if name == "list_organization_members":
                if not ctx.org_id:
                    return {"error": "No active organization context found."}
                url = f"{settings.ORGANIZATION_SERVICE_URL}/api/v1/orgs/{ctx.org_id}/members"
                resp = await client.get(url, headers=headers)
                resp.raise_for_status()
                return resp.json()
                
            elif name == "list_projects":
                url = f"{settings.PROJECT_SERVICE_URL}/api/v1/projects/"
                resp = await client.get(url, headers=headers)
                resp.raise_for_status()
                return resp.json()
                
            elif name == "list_project_tasks":
                project_id = args.get("project_id")
                if not project_id:
                    return {"error": "Missing project_id argument."}
                url = f"{settings.PROJECT_SERVICE_URL}/api/v1/projects/{project_id}/tasks"
                resp = await client.get(url, headers=headers)
                resp.raise_for_status()
                return resp.json()
                
            elif name == "create_project_task":
                project_id = args.get("project_id")
                title = args.get("title")
                if not project_id or not title:
                    return {"error": "Missing project_id or title argument."}
                
                payload = {
                    "title": title,
                    "description": args.get("description"),
                    "priority": args.get("priority", "MEDIUM"),
                    "assignee_id": args.get("assignee_id")
                }
                
                url = f"{settings.PROJECT_SERVICE_URL}/api/v1/projects/{project_id}/tasks"
                resp = await client.post(url, headers=headers, json=payload)
                resp.raise_for_status()
                return resp.json()
                
            else:
                return {"error": f"Unknown tool: {name}"}
                
        except httpx.HTTPStatusError as e:
            logger.error("HTTP error calling microservice for tool %s: %s", name, str(e))
            return {
                "error": f"Service request failed: HTTP {e.response.status_code}",
                "detail": e.response.text
            }
        except Exception as e:
            logger.exception("Unexpected error executing tool %s", name)
            return {"error": f"Unexpected error executing tool {name}: {str(e)}"}
