import uuid
from datetime import datetime
from pydantic import BaseModel

class ConversationCreate(BaseModel):
    title: str = "New Chat"
    context: dict = {}

class ConversationResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    user_id: uuid.UUID
    title: str
    message_count: int
    total_tokens_used: int
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}

class MessageCreate(BaseModel):
    content: str

class MessageResponse(BaseModel):
    id: uuid.UUID
    conversation_id: uuid.UUID
    role: str
    content: str
    tokens_used: int
    model_used: str | None
    created_at: datetime
    model_config = {"from_attributes": True}

class ConversationDetailResponse(ConversationResponse):
    messages: list[MessageResponse] = []

class EmbeddingRequest(BaseModel):
    texts: list[str]

class EmbeddingResponse(BaseModel):
    embeddings: list[list[float]]
    model: str

class CompletionRequest(BaseModel):
    prompt: str
    system_prompt: str | None = None
    temperature: float | None = None
    max_tokens: int | None = None
    conversation_id: uuid.UUID | None = None

class CompletionResponse(BaseModel):
    content: str
    tokens_used: int
    model: str

class ConversationUpdate(BaseModel):
    title: str
