import asyncio
import pytest
from unittest import mock
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from auth_service.core.config import settings
from auth_service.core.database import Base, get_db
from auth_service.main import app

# Engine setup scoped to function
@pytest.fixture
async def test_engine():
    engine = create_async_engine(settings.DATABASE_URL)
    
    # Ensure database tables exist (if not already created)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
    yield engine
    await engine.dispose()

# Transactional database session scoped to each function/test
@pytest.fixture
async def db_session(test_engine):
    connection = await test_engine.connect()
    transaction = await connection.begin()
    
    # Create savepoints to support nested transaction commits/rollbacks
    session = AsyncSession(bind=connection, join_transaction_mode="create_savepoint", expire_on_commit=False)
    
    yield session
    
    await session.close()
    await transaction.rollback()
    await connection.close()

# Dependency override for FastAPI get_db
@pytest.fixture(autouse=True)
def override_db(db_session):
    async def _get_db():
        yield db_session
    app.dependency_overrides[get_db] = _get_db
    yield
    app.dependency_overrides.pop(get_db, None)

# Mock Keycloak user creation
@pytest.fixture(autouse=True)
def mock_keycloak():
    with mock.patch("auth_service.routes.auth.create_keycloak_user", new_callable=mock.AsyncMock) as mock_create:
        yield mock_create

# Mock Kafka producer
@pytest.fixture(autouse=True)
def mock_kafka():
    mock_prod = mock.AsyncMock()
    with mock.patch("auth_service.core.kafka.get_producer", return_value=mock_prod) as mock_get:
        yield mock_get

# Mock Redis functions
@pytest.fixture(autouse=True)
def mock_redis():
    with mock.patch("auth_service.routes.auth.store_refresh_token", new_callable=mock.AsyncMock) as mock_store, \
         mock.patch("auth_service.routes.auth.revoke_all_user_tokens", new_callable=mock.AsyncMock) as mock_revoke, \
         mock.patch("auth_service.services.jwt_service.is_token_blacklisted", new_callable=mock.AsyncMock, return_value=False) as mock_blacklisted, \
         mock.patch("auth_service.services.jwt_service.blacklist_token", new_callable=mock.AsyncMock) as mock_blacklist:
        yield {
            "store": mock_store,
            "revoke": mock_revoke,
            "is_blacklisted": mock_blacklisted,
            "blacklist": mock_blacklist,
        }

# Async client for executing requests against the test application
@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
