import uuid
import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_org_lifecycle(client: AsyncClient):
    user_id = uuid.uuid4()
    
    headers = {
        "X-User-ID": str(user_id),
        "X-User-Role": "admin",
        "X-User-Email": "test@example.com",
        "X-User-Full-Name": "Test User",
    }
    
    # 1. Create organization
    org_payload = {
        "name": "Test Organization",
        "slug": "test-org",
        "description": "An organization for tests",
        "website": "https://example.com",
    }
    create_resp = await client.post("/api/v1/orgs/", json=org_payload, headers=headers)
    assert create_resp.status_code == 201
    org_data = create_resp.json()
    assert org_data["name"] == "Test Organization"
    assert org_data["slug"] == "test-org"
    assert org_data["owner_id"] == str(user_id)
    org_id = org_data["id"]
    
    # 2. List user's organizations
    list_resp = await client.get("/api/v1/orgs/", headers=headers)
    assert list_resp.status_code == 200
    orgs = list_resp.json()
    assert len(orgs) == 1
    assert orgs[0]["id"] == org_id
