from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from knowledge_service.core import search as search_index
from knowledge_service.core.deps import RequestContext, get_request_context
from knowledge_service.core.mongodb import get_db
from knowledge_service.services import document_service

router = APIRouter(prefix="/api/v1/knowledge", tags=["knowledge"])


class DocumentCreate(BaseModel):
    title: str
    content: str
    tags: list[str] = []
    parent_id: str | None = None


class DocumentUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    tags: list[str] | None = None
    is_published: bool | None = None


@router.post("/documents", status_code=201)
async def create_doc(body: DocumentCreate, ctx: RequestContext = Depends(get_request_context)):
    db = get_db()
    doc = await document_service.create_document(db, str(ctx.org_id), str(ctx.user_id), body.title, body.content, body.tags, body.parent_id)
    search_index.index_document(str(doc["id"]), str(ctx.org_id), str(ctx.user_id), doc["title"], doc["content"], doc.get("tags", []))
    return doc


@router.get("/documents")
async def list_docs(tag: str | None = None, skip: int = 0, limit: int = 50, ctx: RequestContext = Depends(get_request_context)):
    return await document_service.list_documents(get_db(), str(ctx.org_id), tag=tag, limit=limit, skip=skip)


@router.get("/documents/{doc_id}")
async def get_doc(doc_id: str, ctx: RequestContext = Depends(get_request_context)):
    from fastapi import HTTPException
    doc = await document_service.get_document(get_db(), doc_id, str(ctx.org_id))
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


@router.patch("/documents/{doc_id}")
async def update_doc(doc_id: str, body: DocumentUpdate, ctx: RequestContext = Depends(get_request_context)):
    from fastapi import HTTPException
    doc = await document_service.update_document(get_db(), doc_id, str(ctx.org_id), body.model_dump(exclude_none=True))
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    search_index.index_document(str(doc["_id"]), str(ctx.org_id), str(ctx.user_id), doc["title"], doc["content"], doc.get("tags", []))
    return doc


@router.delete("/documents/{doc_id}", status_code=204)
async def delete_doc(doc_id: str, ctx: RequestContext = Depends(get_request_context)):
    await document_service.delete_document(get_db(), doc_id, str(ctx.org_id))
    search_index.delete_document(doc_id, str(ctx.org_id), str(ctx.user_id))
