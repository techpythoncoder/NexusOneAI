"""User profile and API key management routes."""

import uuid
import boto3
from botocore.exceptions import BotoCoreError, ClientError

from fastapi import APIRouter, Depends, Header, UploadFile, File, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from auth_service.core.config import settings
from auth_service.core.database import get_db
from auth_service.core.exceptions import AuthError
from auth_service.schemas.user import (
    APIKeyCreate,
    APIKeyCreatedResponse,
    APIKeyResponse,
    UpdateProfileRequest,
    UserResponse,
)
from auth_service.services import jwt_service, user_service

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}
MAX_SIZE_MB = 5


def _b2_client():
    return boto3.client(
        "s3",
        endpoint_url=f"https://{settings.B2_ENDPOINT}",
        aws_access_key_id=settings.B2_KEY_ID,
        aws_secret_access_key=settings.B2_APPLICATION_KEY,
    )

router = APIRouter(prefix="/api/v1/users", tags=["users"])


async def _get_current_user_id(authorization: str = Header(None)) -> uuid.UUID:
    """Extract user_id from Bearer token. Services called via nginx get headers instead,
    but users directly calling auth-service endpoints still need token auth."""
    if not authorization or not authorization.startswith("Bearer "):
        raise AuthError("Missing authorization header")
    payload = await jwt_service.decode_access_token(authorization.removeprefix("Bearer "))
    return uuid.UUID(payload["sub"])


@router.get("/me", response_model=UserResponse)
async def get_me(
    user_id: uuid.UUID = Depends(_get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    user = await user_service.get_user_by_id(db, user_id)
    if not user:
        raise AuthError("User not found")
    return user


@router.patch("/me", response_model=UserResponse)
async def update_me(
    body: UpdateProfileRequest,
    user_id: uuid.UUID = Depends(_get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    return await user_service.update_profile(db, user_id, body)


@router.post("/me/avatar", response_model=UserResponse)
async def upload_avatar(
    file: UploadFile = File(...),
    user_id: uuid.UUID = Depends(_get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, GIF, or WebP images are allowed")

    data = await file.read()
    if len(data) > MAX_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"File must be under {MAX_SIZE_MB} MB")

    ext = (file.filename or "avatar").rsplit(".", 1)[-1].lower()
    if ext not in ("jpg", "jpeg", "png", "gif", "webp"):
        ext = "jpg"
    key = f"avatars/{user_id}.{ext}"

    try:
        s3 = _b2_client()
        s3.put_object(
            Bucket=settings.B2_BUCKET,
            Key=key,
            Body=data,
            ContentType=file.content_type,
        )
        url = f"https://{settings.B2_BUCKET}.{settings.B2_ENDPOINT}/{key}"
    except (BotoCoreError, ClientError) as e:
        raise HTTPException(status_code=502, detail=f"Upload failed: {e}")

    return await user_service.update_profile(db, user_id, UpdateProfileRequest(avatar_url=url))


@router.post("/me/api-keys", response_model=APIKeyCreatedResponse, status_code=201)
async def create_api_key(
    body: APIKeyCreate,
    user_id: uuid.UUID = Depends(_get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    api_key, raw_key = await user_service.create_api_key(db, user_id, body)
    return APIKeyCreatedResponse(
        id=api_key.id,
        name=api_key.name,
        key_prefix=api_key.key_prefix,
        scopes=api_key.scopes.split(","),
        is_active=api_key.is_active,
        expires_at=api_key.expires_at,
        last_used_at=api_key.last_used_at,
        created_at=api_key.created_at,
        key=raw_key,
    )


@router.get("/me/api-keys", response_model=list[APIKeyResponse])
async def list_api_keys(
    user_id: uuid.UUID = Depends(_get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    keys = await user_service.get_user_api_keys(db, user_id)
    return [
        APIKeyResponse(
            id=k.id,
            name=k.name,
            key_prefix=k.key_prefix,
            scopes=k.scopes.split(","),
            is_active=k.is_active,
            expires_at=k.expires_at,
            last_used_at=k.last_used_at,
            created_at=k.created_at,
        )
        for k in keys
    ]


@router.delete("/me/api-keys/{key_id}", status_code=204)
async def revoke_api_key(
    key_id: uuid.UUID,
    user_id: uuid.UUID = Depends(_get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    await user_service.revoke_api_key(db, key_id, user_id)
