"""
Action executor — runs each workflow action type for real.

Template substitution: use {{key}} in action_config strings to inject
values from the event payload that triggered the workflow.
  e.g. title: "Review: {{title}}" with payload {"title": "Fix bug"} → "Review: Fix bug"
"""

import logging
import re

import httpx

from workflow_service.core.config import settings
from workflow_service.core.kafka import get_producer

logger = logging.getLogger(__name__)

PROJECT_SERVICE = "http://nexus-project-service-project-service-1:8003"


# ── Template substitution ─────────────────────────────────────────────────────

def _sub(value: str, data: dict) -> str:
    return re.sub(r"\{\{(\w+)\}\}", lambda m: str(data.get(m.group(1), m.group(0))), value)


def _resolve(config: dict, data: dict) -> dict:
    out = {}
    for k, v in config.items():
        if isinstance(v, str):
            out[k] = _sub(v, data)
        elif isinstance(v, dict):
            out[k] = _resolve(v, data)
        else:
            out[k] = v
    return out


# ── Individual action handlers ─────────────────────────────────────────────────

async def _call_webhook(cfg: dict, trigger_data: dict) -> dict:
    url = cfg.get("url", "")
    if not url:
        raise ValueError("call_webhook requires 'url' in action_config")
    method = cfg.get("method", "POST").upper()
    payload = cfg.get("payload", trigger_data)
    headers = cfg.get("headers", {})
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.request(method, url, json=payload, headers=headers)
        return {"url": url, "status_code": resp.status_code}


async def _create_task(cfg: dict, trigger_data: dict, org_id: str, user_id: str) -> dict:
    project_id = cfg.get("project_id") or trigger_data.get("project_id", "")
    if not project_id:
        raise ValueError("create_task requires 'project_id' in action_config or trigger_data")
    body = {
        "title": cfg.get("title", "Automated Task"),
        "description": cfg.get("description", ""),
        "priority": cfg.get("priority", "MEDIUM"),
    }
    if cfg.get("assignee_id"):
        body["assignee_id"] = cfg["assignee_id"]
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(
            f"{PROJECT_SERVICE}/api/v1/projects/{project_id}/tasks",
            json=body,
            headers={"X-User-ID": user_id, "X-Org-ID": org_id,
                     "Content-Type": "application/json"},
        )
        resp.raise_for_status()
        return {"task_id": resp.json().get("id"), "status_code": resp.status_code}


async def _update_task(cfg: dict, trigger_data: dict, org_id: str, user_id: str) -> dict:
    task_id = cfg.get("task_id") or trigger_data.get("task_id", "")
    project_id = cfg.get("project_id") or trigger_data.get("project_id", "")
    if not task_id or not project_id:
        raise ValueError("update_task requires 'task_id' and 'project_id'")
    body = {k: v for k, v in cfg.items() if k not in ("task_id", "project_id")}
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.patch(
            f"{PROJECT_SERVICE}/api/v1/projects/{project_id}/tasks/{task_id}",
            json=body,
            headers={"X-User-ID": user_id, "X-Org-ID": org_id,
                     "Content-Type": "application/json"},
        )
        resp.raise_for_status()
        return {"status_code": resp.status_code}


async def _send_notification(cfg: dict, trigger_data: dict, org_id: str) -> dict:
    producer = await get_producer()
    event = {
        "event_type": "workflow.notification",
        "service": "workflow-service",
        "payload": {
            "organization_id": org_id,
            "user_id": cfg.get("user_id", trigger_data.get("reporter_id", "")),
            "email": cfg.get("email", ""),
            "subject": cfg.get("subject", "NexusOne: Workflow notification"),
            "message": cfg.get("message", "A workflow action was triggered."),
            "notification_type": "in_app",
            **{k: v for k, v in trigger_data.items() if k not in cfg},
        },
    }
    await producer.send_and_wait(settings.KAFKA_TOPIC_WORKFLOW_EVENTS, value=event)
    return {"queued": True}


async def _send_email(cfg: dict, trigger_data: dict, org_id: str) -> dict:
    producer = await get_producer()
    event = {
        "event_type": "workflow.email",
        "service": "workflow-service",
        "payload": {
            "organization_id": org_id,
            "to": cfg.get("to", cfg.get("email", "")),
            "subject": cfg.get("subject", "NexusOne: Workflow notification"),
            "body": cfg.get("body", cfg.get("message", "")),
            "notification_type": "email",
            **{k: v for k, v in trigger_data.items() if k not in cfg},
        },
    }
    await producer.send_and_wait(settings.KAFKA_TOPIC_WORKFLOW_EVENTS, value=event)
    return {"queued": True}


async def _publish_kafka_event(cfg: dict, trigger_data: dict) -> dict:
    producer = await get_producer()
    topic = cfg.get("topic", settings.KAFKA_TOPIC_WORKFLOW_EVENTS)
    event = {
        "event_type": cfg.get("event_type", "workflow.custom"),
        "service": "workflow-service",
        "payload": {**trigger_data, **cfg.get("payload", {})},
    }
    await producer.send_and_wait(topic, value=event)
    return {"topic": topic}


# ── Public entry point ────────────────────────────────────────────────────────

async def execute_action(
    action_type: str,
    action_config: dict,
    trigger_data: dict,
    org_id: str,
    user_id: str,
) -> dict:
    cfg = _resolve(action_config, trigger_data)

    if action_type == "call_webhook":
        return await _call_webhook(cfg, trigger_data)
    elif action_type == "create_task":
        return await _create_task(cfg, trigger_data, org_id, user_id)
    elif action_type == "update_task":
        return await _update_task(cfg, trigger_data, org_id, user_id)
    elif action_type == "send_notification":
        return await _send_notification(cfg, trigger_data, org_id)
    elif action_type == "send_email":
        return await _send_email(cfg, trigger_data, org_id)
    elif action_type == "publish_kafka_event":
        return await _publish_kafka_event(cfg, trigger_data)
    else:
        raise ValueError(f"Unknown action type: {action_type}")
