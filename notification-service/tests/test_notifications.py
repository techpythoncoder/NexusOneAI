import uuid
import pytest
from httpx import AsyncClient
from notification_service.models.notification import Notification, NotificationType

@pytest.mark.asyncio
async def test_notifications_flow(client: AsyncClient, db_session):
    user_id = uuid.uuid4()
    org_id = uuid.uuid4()
    
    headers = {
        "X-User-ID": str(user_id),
        "X-Org-ID": str(org_id),
        "X-User-Role": "member",
        "X-User-Email": "test@example.com",
    }
    
    # 1. Create a notification in the DB directly
    notif = Notification(
        organization_id=org_id,
        user_id=user_id,
        notification_type=NotificationType.SYSTEM,
        title="Welcome Notification",
        body="Welcome to the workspace!",
        action_url="/projects",
        metadata_={},
    )
    db_session.add(notif)
    await db_session.commit()
    notif_id = notif.id
    
    # 2. Get unread count
    count_resp = await client.get("/api/v1/notifications/count", headers=headers)
    assert count_resp.status_code == 200
    assert count_resp.json()["unread_count"] == 1
    
    # 3. List notifications
    list_resp = await client.get("/api/v1/notifications/", headers=headers)
    assert list_resp.status_code == 200
    data = list_resp.json()
    assert data["total"] == 1
    assert data["items"][0]["id"] == str(notif_id)
    assert data["items"][0]["title"] == "Welcome Notification"
    
    # 4. Mark read
    read_payload = {
        "notification_ids": [str(notif_id)]
    }
    read_resp = await client.post("/api/v1/notifications/read", json=read_payload, headers=headers)
    assert read_resp.status_code == 200
    assert read_resp.json()["updated"] == 1
    
    # 5. Check unread count is 0
    count_resp_after = await client.get("/api/v1/notifications/count", headers=headers)
    assert count_resp_after.status_code == 200
    assert count_resp_after.json()["unread_count"] == 0
