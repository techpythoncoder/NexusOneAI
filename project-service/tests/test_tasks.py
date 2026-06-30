import uuid
import pytest
from httpx import AsyncClient
from project_service.models.task import TaskStatus, TaskPriority

@pytest.mark.anyio
async def test_task_lifecycle(client: AsyncClient):
    org_id = uuid.uuid4()
    user_id = uuid.uuid4()
    
    headers = {
        "X-User-ID": str(user_id),
        "X-Org-ID": str(org_id),
        "X-User-Role": "admin",
        "X-User-Email": "test@example.com",
    }
    
    # 1. Create a project
    proj_payload = {
        "name": "Task Test Project",
        "key": "TSKPROJ",
        "description": "Project for task tests",
        "priority": "HIGH",
    }
    proj_resp = await client.post("/api/v1/projects/", json=proj_payload, headers=headers)
    assert proj_resp.status_code == 201
    project_id = proj_resp.json()["id"]
    
    # 2. Create a task under the project
    task_payload = {
        "title": "Build Test Suite",
        "description": "Add testing coverage",
        "status": "TODO",
        "priority": "MEDIUM",
        "estimated_hours": 4.5,
    }
    task_resp = await client.post(
        f"/api/v1/projects/{project_id}/tasks",
        json=task_payload,
        headers=headers,
    )
    assert task_resp.status_code == 201
    task_data = task_resp.json()
    assert task_data["title"] == "Build Test Suite"
    assert task_data["description"] == "Add testing coverage"
    assert task_data["status"] == "TODO"
    assert task_data["priority"] == "MEDIUM"
    assert task_data["estimated_hours"] == 4.5
    assert task_data["task_number"] == 1
    task_id = task_data["id"]
    
    # 3. List tasks
    list_resp = await client.get(f"/api/v1/projects/{project_id}/tasks", headers=headers)
    assert list_resp.status_code == 200
    tasks = list_resp.json()
    assert len(tasks) == 1
    assert tasks[0]["id"] == task_id
    
    # 4. Update task status (to completed/DONE)
    update_payload = {
        "status": "DONE",
    }
    update_resp = await client.patch(
        f"/api/v1/projects/{project_id}/tasks/{task_id}",
        json=update_payload,
        headers=headers,
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["status"] == "DONE"
    assert update_resp.json()["completed_at"] is not None
    
    # 5. Get individual task
    get_resp = await client.get(f"/api/v1/projects/{project_id}/tasks/{task_id}", headers=headers)
    assert get_resp.status_code == 200
    assert get_resp.json()["status"] == "DONE"
    
    # 6. Delete task
    del_resp = await client.delete(f"/api/v1/projects/{project_id}/tasks/{task_id}", headers=headers)
    assert del_resp.status_code == 204
    
    # Verify task is deleted
    get_deleted_resp = await client.get(f"/api/v1/projects/{project_id}/tasks/{task_id}", headers=headers)
    assert get_deleted_resp.status_code == 404
