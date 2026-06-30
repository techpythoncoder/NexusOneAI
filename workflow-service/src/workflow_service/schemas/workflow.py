import uuid
from datetime import datetime

from pydantic import BaseModel

from workflow_service.models.workflow import ActionType, TriggerType


class WorkflowCreate(BaseModel):
    name: str
    trigger_type: TriggerType
    description: str | None = None
    trigger_config: dict = {}


class WorkflowUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    is_active: bool | None = None
    trigger_config: dict | None = None


class WorkflowResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    name: str
    description: str | None
    is_active: bool
    trigger_type: TriggerType
    trigger_config: dict
    created_by: uuid.UUID
    run_count: int
    last_run_at: datetime | None
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class WorkflowActionCreate(BaseModel):
    action_type: ActionType
    action_config: dict
    position: int = 0


class WorkflowActionResponse(BaseModel):
    id: uuid.UUID
    workflow_id: uuid.UUID
    action_type: ActionType
    action_config: dict
    position: int
    created_at: datetime
    model_config = {"from_attributes": True}


class WorkflowRunResponse(BaseModel):
    id: uuid.UUID
    workflow_id: uuid.UUID
    status: str
    trigger_data: dict
    started_at: datetime | None
    completed_at: datetime | None
    error_message: str | None
    actions_executed: int
    created_at: datetime
    model_config = {"from_attributes": True}
