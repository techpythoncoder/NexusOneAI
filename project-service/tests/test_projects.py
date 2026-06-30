import uuid
import pytest
from httpx import AsyncClient
from project_service.models.project import Project, ProjectStatus

@pytest.mark.anyio
async def test_create_project_success(client: AsyncClient):
    org_id = uuid.uuid4()
    user_id = uuid.uuid4()
    
    headers = {
        "X-User-ID": str(user_id),
        "X-Org-ID": str(org_id),
        "X-User-Role": "admin",
        "X-User-Email": "test@example.com",
    }
    
    payload = {
        "name": "Test Project",
        "key": "TST",
        "description": "This is a test project",
        "priority": "MEDIUM",
    }
    
    response = await client.post("/api/v1/projects/", json=payload, headers=headers)
    assert response.status_code == 201
    
    data = response.json()
    assert data["name"] == "Test Project"
    assert data["key"] == "TST"
    assert data["description"] == "This is a test project"
    assert data["organization_id"] == str(org_id)
    assert "id" in data

@pytest.mark.anyio
async def test_create_project_duplicate_key(client: AsyncClient):
    org_id = uuid.uuid4()
    user_id = uuid.uuid4()
    
    headers = {
        "X-User-ID": str(user_id),
        "X-Org-ID": str(org_id),
        "X-User-Role": "admin",
        "X-User-Email": "test@example.com",
    }
    
    payload1 = {
        "name": "First Project",
        "key": "DUP",
        "description": "First desc",
        "priority": "LOW",
    }
    
    response1 = await client.post("/api/v1/projects/", json=payload1, headers=headers)
    assert response1.status_code == 201
    
    payload2 = {
        "name": "Second Project",
        "key": "DUP",  # Upper case to pass regex validation
        "description": "Second desc",
        "priority": "HIGH",
    }
    
    response2 = await client.post("/api/v1/projects/", json=payload2, headers=headers)
    assert response2.status_code == 409
    assert "already exists" in response2.json()["detail"]

@pytest.mark.anyio
async def test_list_projects(client: AsyncClient):
    org_id = uuid.uuid4()
    user_id = uuid.uuid4()
    
    headers = {
        "X-User-ID": str(user_id),
        "X-Org-ID": str(org_id),
        "X-User-Role": "admin",
        "X-User-Email": "test@example.com",
    }
    
    # List empty projects
    response = await client.get("/api/v1/projects/", headers=headers)
    assert response.status_code == 200
    assert response.json() == []
    
    # Create two projects
    await client.post("/api/v1/projects/", json={"name": "Project A", "key": "PRJA"}, headers=headers)
    await client.post("/api/v1/projects/", json={"name": "Project B", "key": "PRJB"}, headers=headers)
    
    # List projects again
    response = await client.get("/api/v1/projects/", headers=headers)
    assert response.status_code == 200
    projects = response.json()
    assert len(projects) == 2
    assert {p["name"] for p in projects} == {"Project A", "Project B"}
