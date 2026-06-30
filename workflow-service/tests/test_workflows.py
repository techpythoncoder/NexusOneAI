import uuid
import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_workflow_lifecycle(client: AsyncClient):
    org_id = uuid.uuid4()
    user_id = uuid.uuid4()
    
    headers = {
        "X-User-ID": str(user_id),
        "X-Org-ID": str(org_id),
        "X-User-Role": "admin",
        "X-User-Email": "test@example.com",
    }
    
    # 1. Create a workflow
    payload = {
        "name": "Project Notification Workflow",
        "trigger_type": "project_created",
        "description": "Send notification on project creation",
        "trigger_config": {},
    }
    
    create_resp = await client.post("/api/v1/workflows/", json=payload, headers=headers)
    assert create_resp.status_code == 201
    wf_data = create_resp.json()
    assert wf_data["name"] == "Project Notification Workflow"
    assert wf_data["trigger_type"] == "project_created"
    assert wf_data["is_active"] is True
    workflow_id = wf_data["id"]
    
    # 2. Add an action to the workflow
    action_payload = {
        "action_type": "send_notification",
        "action_config": {
            "subject": "New project created: {{name}}",
            "message": "Project '{{name}}' was just created.",
        },
        "position": 1,
    }
    action_resp = await client.post(
        f"/api/v1/workflows/{workflow_id}/actions",
        json=action_payload,
        headers=headers,
    )
    assert action_resp.status_code == 201
    assert action_resp.json()["action_type"] == "send_notification"
    
    # 3. List actions
    actions_resp = await client.get(f"/api/v1/workflows/{workflow_id}/actions", headers=headers)
    assert actions_resp.status_code == 200
    assert len(actions_resp.json()) == 1
    
    # 4. Trigger the workflow
    trigger_payload = {
        "name": "New Project Alpha",
    }
    trigger_resp = await client.post(
        f"/api/v1/workflows/{workflow_id}/trigger",
        json=trigger_payload,
        headers=headers,
    )
    assert trigger_resp.status_code == 200
    run_data = trigger_resp.json()
    assert run_data["status"] in ("success", "running")
    assert run_data["workflow_id"] == workflow_id
