import asyncio
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from workflow_service.core.exceptions import NotFoundError
from workflow_service.models.workflow import Workflow
from workflow_service.models.workflow_action import WorkflowAction
from workflow_service.models.workflow_run import RunStatus, WorkflowRun
from workflow_service.schemas.workflow import WorkflowActionCreate, WorkflowCreate, WorkflowUpdate

logger = logging.getLogger(__name__)


async def create_workflow(
    db: AsyncSession, data: WorkflowCreate, org_id: uuid.UUID, user_id: uuid.UUID
) -> Workflow:
    wf = Workflow(organization_id=org_id, created_by=user_id, **data.model_dump())
    db.add(wf)
    await db.flush()
    return wf


async def get_workflow_or_404(
    db: AsyncSession, workflow_id: uuid.UUID, org_id: uuid.UUID
) -> Workflow:
    result = await db.execute(
        select(Workflow).where(Workflow.id == workflow_id, Workflow.organization_id == org_id)
    )
    wf = result.scalar_one_or_none()
    if not wf:
        raise NotFoundError("Workflow")
    return wf


async def list_workflows(
    db: AsyncSession, org_id: uuid.UUID, is_active: bool | None = None
) -> list[Workflow]:
    q = select(Workflow).where(Workflow.organization_id == org_id)
    if is_active is not None:
        q = q.where(Workflow.is_active == is_active)
    result = await db.execute(q)
    return list(result.scalars().all())


async def update_workflow(
    db: AsyncSession, workflow_id: uuid.UUID, org_id: uuid.UUID, data: WorkflowUpdate
) -> Workflow:
    wf = await get_workflow_or_404(db, workflow_id, org_id)
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(wf, field, value)
    return wf


async def delete_workflow(db: AsyncSession, workflow_id: uuid.UUID, org_id: uuid.UUID) -> None:
    wf = await get_workflow_or_404(db, workflow_id, org_id)
    await db.delete(wf)


async def add_action(
    db: AsyncSession, workflow_id: uuid.UUID, org_id: uuid.UUID, data: WorkflowActionCreate
) -> WorkflowAction:
    wf = await get_workflow_or_404(db, workflow_id, org_id)
    action = WorkflowAction(workflow_id=wf.id, organization_id=org_id, **data.model_dump())
    db.add(action)
    await db.flush()
    return action


async def list_actions(
    db: AsyncSession, workflow_id: uuid.UUID, org_id: uuid.UUID
) -> list[WorkflowAction]:
    result = await db.execute(
        select(WorkflowAction)
        .where(WorkflowAction.workflow_id == workflow_id, WorkflowAction.organization_id == org_id)
        .order_by(WorkflowAction.position)
    )
    return list(result.scalars().all())


async def trigger_workflow(
    db: AsyncSession,
    workflow_id: uuid.UUID,
    org_id: uuid.UUID,
    trigger_data: dict,
    user_id: uuid.UUID,
) -> WorkflowRun:
    wf = await get_workflow_or_404(db, workflow_id, org_id)
    actions = await list_actions(db, workflow_id, org_id)
    now = datetime.now(timezone.utc)
    run = WorkflowRun(
        workflow_id=wf.id,
        organization_id=org_id,
        trigger_data=trigger_data,
        status=RunStatus.RUNNING,
        started_at=now,
    )
    db.add(run)
    wf.run_count += 1
    wf.last_run_at = now
    await db.commit()   # commit so _execute_run can find the run in its own session
    run_id = run.id

    # Execute actions in background so the API response returns immediately
    asyncio.create_task(
        _execute_run(run_id, str(org_id), str(user_id), actions, trigger_data)
    )
    return run


async def _execute_run(
    run_id: uuid.UUID,
    org_id: str,
    user_id: str,
    actions: list[WorkflowAction],
    trigger_data: dict,
) -> None:
    from workflow_service.core.database import AsyncSessionLocal
    from workflow_service.core.executor import execute_action

    executed = 0
    errors: list[str] = []

    for action in sorted(actions, key=lambda a: a.position):
        try:
            await execute_action(
                action.action_type,
                action.action_config,
                trigger_data,
                org_id,
                user_id,
            )
            executed += 1
            logger.info("Action executed: %s run=%s", action.action_type, run_id)
        except Exception as exc:
            msg = f"{action.action_type}: {exc}"
            errors.append(msg)
            logger.exception("Action failed: %s run=%s", action.action_type, run_id)

    async with AsyncSessionLocal() as db:
        run = await db.get(WorkflowRun, run_id)
        if run:
            run.actions_executed = executed
            run.status = RunStatus.SUCCESS if not errors else RunStatus.FAILED
            run.completed_at = datetime.now(timezone.utc)
            run.error_message = "; ".join(errors) if errors else None
            await db.commit()


def _conditions_match(trigger_config: dict, payload: dict) -> bool:
    """All keys in trigger_config must match the payload value (if present)."""
    for key, expected in trigger_config.items():
        actual = payload.get(key)
        if actual is not None and str(actual) != str(expected):
            return False
    return True


async def auto_trigger(
    db: AsyncSession,
    trigger_type: str,
    org_id: uuid.UUID,
    payload: dict,
) -> int:
    """Find active workflows matching trigger_type + conditions and fire them."""
    result = await db.execute(
        select(Workflow).where(
            Workflow.organization_id == org_id,
            Workflow.trigger_type == trigger_type,
            Workflow.is_active == True,  # noqa: E712
        )
    )
    workflows = list(result.scalars().all())

    fired = 0
    system_user = uuid.UUID("00000000-0000-0000-0000-000000000000")
    for wf in workflows:
        if not _conditions_match(wf.trigger_config, payload):
            continue
        await trigger_workflow(db, wf.id, org_id, payload, system_user)
        fired += 1
    return fired


async def list_runs(
    db: AsyncSession, workflow_id: uuid.UUID, org_id: uuid.UUID, limit: int = 50
) -> list[WorkflowRun]:
    result = await db.execute(
        select(WorkflowRun)
        .where(WorkflowRun.workflow_id == workflow_id, WorkflowRun.organization_id == org_id)
        .order_by(WorkflowRun.created_at.desc())
        .limit(limit)
    )
    return list(result.scalars().all())
