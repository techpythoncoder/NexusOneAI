from fastapi import APIRouter, Depends, Query
from search_service.core.deps import RequestContext, get_request_context
from search_service.services.opensearch_service import search, index_document, delete_document
from pydantic import BaseModel

router = APIRouter(prefix="/api/v1/search", tags=["search"])


class IndexRequest(BaseModel):
    resource_type: str
    doc_id: str
    body: dict


@router.get("/")
async def search_all(
    q: str = Query(..., min_length=1),
    types: str | None = Query(None, description="Comma-separated: projects,tasks,documents"),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    ctx: RequestContext = Depends(get_request_context),
):
    resource_types = types.split(",") if types else None
    return await search(q, str(ctx.org_id), user_id=str(ctx.user_id), resource_types=resource_types, skip=skip, limit=limit)


@router.post("/index", status_code=201)
async def index(body: IndexRequest, ctx: RequestContext = Depends(get_request_context)):
    body.body["organization_id"] = str(ctx.org_id)
    await index_document(body.resource_type, body.doc_id, body.body)
    return {"indexed": True}


@router.delete("/index/{resource_type}/{doc_id}", status_code=204)
async def remove_from_index(resource_type: str, doc_id: str, ctx: RequestContext = Depends(get_request_context)):
    await delete_document(resource_type, doc_id)
