import uuid
import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_chat_channels_flow(client: AsyncClient):
    org_id = uuid.uuid4()
    user_id = uuid.uuid4()
    
    headers = {
        "X-User-ID": str(user_id),
        "X-Org-ID": str(org_id),
        "X-User-Role": "member",
        "X-User-Email": "test@example.com",
    }
    
    # 1. Create a channel
    payload = {
        "name": "General Chat",
        "description": "General discussions channel",
        "channel_type": "public",
    }
    
    create_resp = await client.post("/api/v1/chat/channels", json=payload, headers=headers)
    assert create_resp.status_code == 201
    data = create_resp.json()
    assert data["name"] == "General Chat"
    assert data["channel_type"] == "public"
    assert "id" in data
    channel_id = data["id"]
    
    # 2. List channels
    list_resp = await client.get("/api/v1/chat/channels", headers=headers)
    assert list_resp.status_code == 200
    channels = list_resp.json()
    assert len(channels) == 1
    assert channels[0]["id"] == channel_id
    assert channels[0]["name"] == "General Chat"
