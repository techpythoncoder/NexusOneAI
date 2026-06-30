from redis.asyncio import Redis

from auth_service.core.config import settings

# db=1 keeps token blacklist separate from application cache (db=0)
redis_client: Redis = Redis.from_url(
    settings.REDIS_URL,
    db=settings.REDIS_TOKEN_DB,
    decode_responses=True,
)


async def blacklist_token(jti: str, ttl_seconds: int) -> None:
    """Mark a token as revoked. Expires automatically when the token would have expired."""
    await redis_client.setex(f"blacklist:{jti}", ttl_seconds, "1")


async def is_token_blacklisted(jti: str) -> bool:
    return await redis_client.exists(f"blacklist:{jti}") == 1


async def store_refresh_token(user_id: str, jti: str, ttl_seconds: int) -> None:
    """Track active refresh tokens per user so we can revoke all on logout."""
    pipe = redis_client.pipeline()
    pipe.setex(f"refresh:{jti}", ttl_seconds, user_id)
    pipe.sadd(f"user_tokens:{user_id}", jti)
    pipe.expire(f"user_tokens:{user_id}", ttl_seconds)
    await pipe.execute()


async def revoke_all_user_tokens(user_id: str) -> None:
    """Logout from all devices — invalidates every refresh token for this user."""
    jtis = await redis_client.smembers(f"user_tokens:{user_id}")
    if jtis:
        pipe = redis_client.pipeline()
        for jti in jtis:
            pipe.delete(f"refresh:{jti}")
            pipe.setex(f"blacklist:{jti}", 86400 * 30, "1")
        pipe.delete(f"user_tokens:{user_id}")
        await pipe.execute()
