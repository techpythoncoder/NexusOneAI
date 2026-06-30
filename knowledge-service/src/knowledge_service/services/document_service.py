"""
Knowledge base document service using MongoDB.

Documents stored in MongoDB (flexible schema for rich content).
Each document is always scoped to organization_id.
"""

import uuid
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorDatabase

COLLECTION = "documents"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def create_document(db: AsyncIOMotorDatabase, org_id: str, user_id: str, title: str, content: str, tags: list[str] | None = None, parent_id: str | None = None) -> dict:
    doc = {
        "_id": str(uuid.uuid4()),
        "organization_id": org_id,
        "created_by": user_id,
        "title": title,
        "content": content,
        "tags": tags or [],
        "parent_id": parent_id,
        "is_published": False,
        "version": 1,
        "created_at": _now(),
        "updated_at": _now(),
    }
    await db[COLLECTION].insert_one(doc)
    doc["id"] = doc.pop("_id")
    return doc


async def get_document(db: AsyncIOMotorDatabase, doc_id: str, org_id: str) -> dict | None:
    doc = await db[COLLECTION].find_one({"_id": doc_id, "organization_id": org_id})
    if doc:
        doc["id"] = doc.pop("_id")
    return doc


async def list_documents(db: AsyncIOMotorDatabase, org_id: str, tag: str | None = None, limit: int = 50, skip: int = 0) -> list[dict]:
    query: dict = {"organization_id": org_id}
    if tag:
        query["tags"] = tag
    cursor = db[COLLECTION].find(query).sort("updated_at", -1).skip(skip).limit(limit)
    docs = []
    async for doc in cursor:
        doc["id"] = doc.pop("_id")
        docs.append(doc)
    return docs


async def update_document(db: AsyncIOMotorDatabase, doc_id: str, org_id: str, updates: dict) -> dict | None:
    updates["updated_at"] = _now()
    updates["$inc"] = {"version": 1}
    result = await db[COLLECTION].find_one_and_update(
        {"_id": doc_id, "organization_id": org_id},
        {"$set": {k: v for k, v in updates.items() if k != "$inc"}, "$inc": {"version": 1}},
        return_document=True,
    )
    if result:
        result["id"] = result.pop("_id")
    return result


async def delete_document(db: AsyncIOMotorDatabase, doc_id: str, org_id: str) -> bool:
    result = await db[COLLECTION].delete_one({"_id": doc_id, "organization_id": org_id})
    return result.deleted_count > 0
