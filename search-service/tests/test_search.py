import uuid
import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_search_index_and_query(client: AsyncClient, mock_opensearch):
    org_id = uuid.uuid4()
    user_id = uuid.uuid4()
    
    headers = {
        "X-User-ID": str(user_id),
        "X-Org-ID": str(org_id),
        "X-User-Role": "member",
        "X-User-Email": "test@example.com",
    }
    
    # 1. Post to index
    index_payload = {
        "resource_type": "projects",
        "doc_id": "test-doc-id",
        "body": {
            "name": "Search Test Project",
            "description": "OpenSearch index test",
        }
    }
    create_resp = await client.post("/api/v1/search/index", json=index_payload, headers=headers)
    assert create_resp.status_code == 201
    assert create_resp.json()["indexed"] is True
    assert mock_opensearch["index_document"].called
    
    # 2. Get search query
    search_resp = await client.get("/api/v1/search/?q=Search", headers=headers)
    assert search_resp.status_code == 200
    assert mock_opensearch["search"].called
    
    # 3. Delete from index
    delete_resp = await client.delete("/api/v1/search/index/projects/test-doc-id", headers=headers)
    assert delete_resp.status_code == 204
    assert mock_opensearch["delete_document"].called

@pytest.mark.asyncio
async def test_search_intent_parsing():
    from search_service.services.opensearch_service import _rule_parse_intent
    
    # 1. Verify typo mapping
    intent_typo = _rule_parse_intent("what is the recent notifification come")
    assert intent_typo is not None
    assert intent_typo["types"] == ["notifications"]
    assert intent_typo["text"] == "come"

    # 2. Verify prefix mappings
    intent_proj = _rule_parse_intent("list my proj")
    assert intent_proj is not None
    assert intent_proj["types"] == ["projects"]

    intent_tasks = _rule_parse_intent("show ongoing task")
    assert intent_tasks is not None
    assert intent_tasks["types"] == ["tasks"]

