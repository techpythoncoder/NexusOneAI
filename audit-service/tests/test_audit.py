import uuid
from datetime import datetime, timezone
import pytest
from httpx import AsyncClient
from audit_service.models.audit_log import AuditLog

@pytest.mark.asyncio
async def test_audit_logs_endpoint(client: AsyncClient, db_session):
    org_id = uuid.uuid4()
    user_id = uuid.uuid4()
    
    headers = {
        "X-User-ID": str(user_id),
        "X-Org-ID": str(org_id),
        "X-User-Role": "admin",
        "X-User-Email": "test@example.com",
    }
    
    # 1. Insert mock audit log
    log = AuditLog(
        organization_id=org_id,
        actor_id=user_id,
        actor_email="test@example.com",
        action="project.created",
        resource_type="project",
        resource_id="proj-123",
        source_service="project-service",
        payload={"name": "Audit project"},
        occurred_at=datetime.now(timezone.utc),
    )
    db_session.add(log)
    await db_session.commit()
    
    # 2. Test list audit logs endpoint
    logs_resp = await client.get("/api/v1/audit/logs?action=project.created", headers=headers)
    assert logs_resp.status_code == 200
    logs_data = logs_resp.json()
    assert len(logs_data) == 1
    assert logs_data[0]["action"] == "project.created"
    assert logs_data[0]["actor_email"] == "test@example.com"
    assert logs_data[0]["payload"]["name"] == "Audit project"
