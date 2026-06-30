import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth_service.core.exceptions import AuthError, ConflictError, NotFoundError
from auth_service.models.api_key import APIKey
from auth_service.models.user import User
from auth_service.schemas.user import APIKeyCreate, UpdateProfileRequest


def _hash_password(password: str) -> str:
    from passlib.context import CryptContext
    ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
    return ctx.hash(password)


def _verify_password(plain: str, hashed: str) -> bool:
    from passlib.context import CryptContext
    ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
    return ctx.verify(plain, hashed)


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(select(User).where(User.email == email.lower()))
    return result.scalar_one_or_none()


async def get_user_by_id(db: AsyncSession, user_id: uuid.UUID) -> User | None:
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def create_user(db: AsyncSession, email: str, password: str, full_name: str | None) -> User:
    existing = await get_user_by_email(db, email)
    if existing:
        raise ConflictError("An account with this email already exists")

    verification_token = secrets.token_urlsafe(32)
    user = User(
        email=email.lower(),
        hashed_password=_hash_password(password),
        full_name=full_name,
        verification_token=verification_token,
        verification_token_expires=datetime.now(timezone.utc) + timedelta(hours=24),
    )
    db.add(user)
    await db.flush()   # get the ID without committing
    return user


async def authenticate_user(db: AsyncSession, email: str, password: str) -> User:
    user = await get_user_by_email(db, email)
    if not user:
        raise AuthError("No account found with this email address")
    if not user.hashed_password or not _verify_password(password, user.hashed_password):
        raise AuthError("Invalid email or password")
    if not user.is_active:
        raise AuthError("Account has been deactivated")
    return user


async def verify_email(db: AsyncSession, token: str) -> User:
    result = await db.execute(
        select(User).where(
            User.verification_token == token,
            User.verification_token_expires > datetime.now(timezone.utc),
        )
    )
    user = result.scalar_one_or_none()
    if not user:
        raise AuthError("Invalid or expired verification token")
    user.is_verified = True
    user.verification_token = None
    user.verification_token_expires = None
    return user


async def update_profile(
    db: AsyncSession, user_id: uuid.UUID, data: UpdateProfileRequest
) -> User:
    user = await get_user_by_id(db, user_id)
    if not user:
        raise NotFoundError("User")
    if data.full_name is not None:
        user.full_name = data.full_name
    if data.avatar_url is not None:
        user.avatar_url = data.avatar_url
    return user


async def create_api_key(
    db: AsyncSession, user_id: uuid.UUID, data: APIKeyCreate
) -> tuple[APIKey, str]:
    """Returns (APIKey db record, plaintext_key). Plaintext shown once — never stored."""
    raw_key = f"nx_{secrets.token_urlsafe(32)}"
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
    prefix = raw_key[:8]

    expires_at = None
    if data.expires_days:
        expires_at = datetime.now(timezone.utc) + timedelta(days=data.expires_days)

    api_key = APIKey(
        user_id=user_id,
        organization_id=data.organization_id,
        name=data.name,
        key_prefix=prefix,
        key_hash=key_hash,
        scopes=",".join(data.scopes),
        expires_at=expires_at,
    )
    db.add(api_key)
    await db.flush()
    return api_key, raw_key


async def get_user_api_keys(db: AsyncSession, user_id: uuid.UUID) -> list[APIKey]:
    result = await db.execute(
        select(APIKey).where(APIKey.user_id == user_id, APIKey.is_active == True)  # noqa: E712
    )
    return list(result.scalars().all())


async def revoke_api_key(db: AsyncSession, key_id: uuid.UUID, user_id: uuid.UUID) -> None:
    result = await db.execute(
        select(APIKey).where(APIKey.id == key_id, APIKey.user_id == user_id)
    )
    key = result.scalar_one_or_none()
    if not key:
        raise NotFoundError("API key")
    key.is_active = False
