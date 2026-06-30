"""
LLM service — Groq API with llama-3.3-70b-versatile.
Handles chat completions, streaming, and conversation history.
"""

import logging
from typing import AsyncGenerator
import asyncio
import httpx

from ai_service.core.config import settings

logger = logging.getLogger(__name__)

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {settings.GROQ_API_KEY}",
        "Content-Type": "application/json",
    }


def is_mock_mode() -> bool:
    key = settings.GROQ_API_KEY
    return not key or "your_groq_api_key" in key or key.startswith("mock")


async def chat_completion(
    messages: list[dict],
    *,
    temperature: float | None = None,
    max_tokens: int | None = None,
    tools: list[dict] | None = None,
) -> dict:
    """Single-shot chat completion. Returns full response dict."""
    if is_mock_mode():
        user_prompt = messages[-1]["content"] if messages else ""
        return {
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": f"Hi! I am your NexusOne AI Assistant. (Dev Mode Fallback)\n\nI received your query: \"{user_prompt}\".\n\nTo activate real AI responses, please configure a valid `GROQ_API_KEY` in the `ai-service` `.env` file."
                    }
                }
            ],
            "usage": {
                "total_tokens": 15
            },
            "model": "mock-llama-3.3-70b"
        }

    payload = {
        "model": settings.GROQ_MODEL,
        "messages": messages,
        "temperature": temperature or settings.GROQ_TEMPERATURE,
        "max_tokens": max_tokens or settings.GROQ_MAX_TOKENS,
    }
    if tools:
        payload["tools"] = tools

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(GROQ_API_URL, headers=_headers(), json=payload)
        resp.raise_for_status()
        return resp.json()


async def stream_chat_completion(
    messages: list[dict],
    *,
    temperature: float | None = None,
    max_tokens: int | None = None,
    tools: list[dict] | None = None,
) -> AsyncGenerator[dict, None]:
    """Streaming chat completion — yields structured dicts with content or tool calls."""
    if is_mock_mode():
        user_prompt = messages[-1]["content"] if messages else ""
        mock_response = f"Hi! I am your NexusOne AI Assistant. (Dev Mode Fallback)\n\nI received your query: \"{user_prompt}\".\n\nTo activate real AI responses, please configure a valid `GROQ_API_KEY` in the `ai-service` `.env` file."
        for word in mock_response.split(" "):
            yield {"type": "content", "content": word + " "}
            await asyncio.sleep(0.05)
        return

    payload = {
        "model": settings.GROQ_MODEL,
        "messages": messages,
        "temperature": temperature or settings.GROQ_TEMPERATURE,
        "max_tokens": max_tokens or settings.GROQ_MAX_TOKENS,
        "stream": True,
    }
    if tools:
        payload["tools"] = tools

    async with httpx.AsyncClient(timeout=120.0) as client:
        async with client.stream("POST", GROQ_API_URL, headers=_headers(), json=payload) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if line.startswith("data: "):
                    chunk = line[6:]
                    if chunk == "[DONE]":
                        return
                    import json
                    try:
                        data = json.loads(chunk)
                        delta = data["choices"][0]["delta"]
                        if "tool_calls" in delta and delta["tool_calls"]:
                            yield {"type": "tool_calls", "tool_calls": delta["tool_calls"]}
                        elif "content" in delta and delta["content"]:
                            yield {"type": "content", "content": delta["content"]}
                    except (json.JSONDecodeError, KeyError):
                        continue


async def get_embeddings(texts: list[str]) -> list[list[float]]:
    """Generate embeddings via HuggingFace Inference API (BGE-M3)."""
    if not settings.HUGGINGFACE_API_KEY or "your_huggingface_api_key" in settings.HUGGINGFACE_API_KEY:
        # Return zero vectors when HF key not configured (dev mode)
        return [[0.0] * settings.EMBEDDING_DIMENSION for _ in texts]

    url = f"https://router.huggingface.co/hf-inference/models/{settings.EMBEDDING_MODEL}/pipeline/feature-extraction"
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            url,
            headers={"Authorization": f"Bearer {settings.HUGGINGFACE_API_KEY}"},
            json={"inputs": texts},
        )
        resp.raise_for_status()
        return resp.json()
