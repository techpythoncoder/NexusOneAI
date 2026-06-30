import uuid
from datetime import datetime, timezone
import pytest
from httpx import AsyncClient
from analytics_service.models.event import AnalyticsEvent

@pytest.mark.asyncio
async def test_analytics_endpoints(client: AsyncClient, db_session):
    org_id = uuid.uuid4()
    user_id = uuid.uuid4()
    
    headers = {
        "X-User-ID": str(user_id),
        "X-Org-ID": str(org_id),
        "X-User-Role": "admin",
        "X-User-Email": "test@example.com",
    }
    
    # 1. Insert mock event
    event = AnalyticsEvent(
        organization_id=org_id,
        user_id=user_id,
        event_type="project.created",
        resource_type="project",
        resource_id="proj-123",
        properties={"name": "Test project"},
        occurred_at=datetime.now(timezone.utc),
    )
    db_session.add(event)
    await db_session.commit()
    
    # 2. Test summary endpoint
    summary_resp = await client.get("/api/v1/analytics/summary?days=7", headers=headers)
    assert summary_resp.status_code == 200
    summary_data = summary_resp.json()
    assert summary_data["period_days"] == 7
    assert len(summary_data["events"]) == 1
    assert summary_data["events"][0]["type"] == "project.created"
    assert summary_data["events"][0]["count"] == 1
    
    # 3. Test list events endpoint
    events_resp = await client.get("/api/v1/analytics/events?event_type=project.created", headers=headers)
    assert events_resp.status_code == 200
    events_data = events_resp.json()
    assert len(events_data) == 1
    assert events_data[0]["event_type"] == "project.created"
    assert events_data[0]["properties"]["name"] == "Test project"
