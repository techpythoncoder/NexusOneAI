import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ai_service.core.exceptions import NotFoundError
from ai_service.models.ai_conversation import AIConversation, AIMessage, ConversationStatus, MessageRole
from ai_service.services import llm_service


async def create_conversation(db: AsyncSession, org_id: uuid.UUID, user_id: uuid.UUID, title: str = "New Chat", context: dict | None = None) -> AIConversation:
    conv = AIConversation(organization_id=org_id, user_id=user_id, title=title, context=context or {})
    db.add(conv)
    await db.flush()
    return conv


async def get_conversation_or_404(db: AsyncSession, conv_id: uuid.UUID, org_id: uuid.UUID) -> AIConversation:
    result = await db.execute(
        select(AIConversation).options(selectinload(AIConversation.messages))
        .where(AIConversation.id == conv_id, AIConversation.organization_id == org_id)
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise NotFoundError("Conversation")
    return conv


async def list_conversations(db: AsyncSession, org_id: uuid.UUID, user_id: uuid.UUID) -> list[AIConversation]:
    result = await db.execute(
        select(AIConversation)
        .where(AIConversation.organization_id == org_id, AIConversation.user_id == user_id, AIConversation.status == ConversationStatus.ACTIVE)
        .order_by(AIConversation.updated_at.desc())
    )
    return list(result.scalars().all())


async def send_message(
    db: AsyncSession,
    conv_id: uuid.UUID,
    org_id: uuid.UUID,
    user_content: str,
) -> AIMessage:
    conv = await get_conversation_or_404(db, conv_id, org_id)

    # Auto-generate title if it's the first message
    if conv.title.lower() == "new chat" or conv.message_count == 0:
        try:
            summary_prompt = [
                {
                    "role": "system",
                    "content": "Summarize the user message into a concise, relevant title of 3-4 words max. Do not use quotes, punctuation, or prefixes like 'Title:'. Output the short title directly."
                },
                {"role": "user", "content": user_content}
            ]
            summary_resp = await llm_service.chat_completion(summary_prompt)
            suggested = summary_resp["choices"][0]["message"]["content"].strip().strip('"').strip("'")
            if suggested and len(suggested) < 60:
                conv.title = suggested
            else:
                words = user_content.strip().split()
                conv.title = " ".join(words[:4]) + ("..." if len(user_content) > 30 else "")
        except Exception:
            words = user_content.strip().split()
            conv.title = " ".join(words[:4]) + ("..." if len(user_content) > 30 else "")

    # Store user message
    user_msg = AIMessage(conversation_id=conv.id, organization_id=org_id, role=MessageRole.USER, content=user_content)
    db.add(user_msg)

    # Build message history for the LLM
    system_prompt = "You are NexusOne AI, a helpful business operations assistant. " + (
        f"Context: {conv.context}" if conv.context else ""
    )
    history = [{"role": "system", "content": system_prompt}]
    for m in conv.messages[-20:]:  # last 20 messages for context window
        history.append({"role": m.role.value, "content": m.content})
    history.append({"role": "user", "content": user_content})

    # Call Groq
    response = await llm_service.chat_completion(history)
    assistant_content = response["choices"][0]["message"]["content"]
    tokens = response.get("usage", {}).get("total_tokens", 0)

    # Store assistant message
    assistant_msg = AIMessage(
        conversation_id=conv.id,
        organization_id=org_id,
        role=MessageRole.ASSISTANT,
        content=assistant_content,
        tokens_used=tokens,
        model_used=settings.GROQ_MODEL,
    )
    db.add(assistant_msg)

    conv.message_count += 2
    conv.total_tokens_used += tokens
    conv.updated_at = datetime.now(timezone.utc)
    await db.flush()
    return assistant_msg


async def update_conversation(db: AsyncSession, conv_id: uuid.UUID, org_id: uuid.UUID, title: str) -> AIConversation:
    conv = await get_conversation_or_404(db, conv_id, org_id)
    conv.title = title
    conv.updated_at = datetime.now(timezone.utc)
    await db.flush()
    return conv


async def delete_conversation(db: AsyncSession, conv_id: uuid.UUID, org_id: uuid.UUID) -> None:
    conv = await get_conversation_or_404(db, conv_id, org_id)
    await db.delete(conv)
    await db.flush()


from ai_service.core.config import settings  # noqa: E402
