import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from workflow_service.core.database import get_db
from workflow_service.core.deps import RequestContext, get_request_context
from workflow_service.core.kafka import publish_workflow_event
from workflow_service.schemas.workflow import (
    WorkflowActionCreate,
    WorkflowActionResponse,
    WorkflowCreate,
    WorkflowResponse,
    WorkflowRunResponse,
    WorkflowUpdate,
)
from workflow_service.services import workflow_service

router = APIRouter(prefix="/api/v1/workflows", tags=["workflows"])


@router.post("/", response_model=WorkflowResponse, status_code=201)
async def create_workflow(
    body: WorkflowCreate,
    ctx: RequestContext = Depends(get_request_context),
    db: AsyncSession = Depends(get_db),
):
    wf = await workflow_service.create_workflow(db, body, ctx.org_id, ctx.user_id)
    await publish_workflow_event("workflow.created", {
        "workflow_id": str(wf.id),
        "organization_id": str(ctx.org_id),
        "name": wf.name,
        "trigger_type": wf.trigger_type.value,
    })
    return wf


@router.get("/", response_model=list[WorkflowResponse])
async def list_workflows(
    is_active: bool | None = None,
    ctx: RequestContext = Depends(get_request_context),
    db: AsyncSession = Depends(get_db),
):
    return await workflow_service.list_workflows(db, ctx.org_id, is_active)


@router.get("/{workflow_id}", response_model=WorkflowResponse)
async def get_workflow(
    workflow_id: uuid.UUID,
    ctx: RequestContext = Depends(get_request_context),
    db: AsyncSession = Depends(get_db),
):
    return await workflow_service.get_workflow_or_404(db, workflow_id, ctx.org_id)


@router.patch("/{workflow_id}", response_model=WorkflowResponse)
async def update_workflow(
    workflow_id: uuid.UUID,
    body: WorkflowUpdate,
    ctx: RequestContext = Depends(get_request_context),
    db: AsyncSession = Depends(get_db),
):
    return await workflow_service.update_workflow(db, workflow_id, ctx.org_id, body)


@router.delete("/{workflow_id}", status_code=204)
async def delete_workflow(
    workflow_id: uuid.UUID,
    ctx: RequestContext = Depends(get_request_context),
    db: AsyncSession = Depends(get_db),
):
    await workflow_service.delete_workflow(db, workflow_id, ctx.org_id)


@router.post("/{workflow_id}/actions", response_model=WorkflowActionResponse, status_code=201)
async def add_action(
    workflow_id: uuid.UUID,
    body: WorkflowActionCreate,
    ctx: RequestContext = Depends(get_request_context),
    db: AsyncSession = Depends(get_db),
):
    return await workflow_service.add_action(db, workflow_id, ctx.org_id, body)


@router.get("/{workflow_id}/actions", response_model=list[WorkflowActionResponse])
async def list_actions(
    workflow_id: uuid.UUID,
    ctx: RequestContext = Depends(get_request_context),
    db: AsyncSession = Depends(get_db),
):
    return await workflow_service.list_actions(db, workflow_id, ctx.org_id)


@router.post("/{workflow_id}/trigger", response_model=WorkflowRunResponse)
async def trigger_workflow(
    workflow_id: uuid.UUID,
    trigger_data: dict = {},
    ctx: RequestContext = Depends(get_request_context),
    db: AsyncSession = Depends(get_db),
):
    run = await workflow_service.trigger_workflow(
        db, workflow_id, ctx.org_id, trigger_data, ctx.user_id
    )
    await publish_workflow_event("workflow.triggered", {
        "workflow_id": str(workflow_id),
        "run_id": str(run.id),
        "organization_id": str(ctx.org_id),
        "triggered_by": str(ctx.user_id),
    })
    return run


@router.get("/{workflow_id}/runs", response_model=list[WorkflowRunResponse])
async def list_runs(
    workflow_id: uuid.UUID,
    limit: int = 50,
    ctx: RequestContext = Depends(get_request_context),
    db: AsyncSession = Depends(get_db),
):
    return await workflow_service.list_runs(db, workflow_id, ctx.org_id, limit)
