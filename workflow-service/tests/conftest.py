import asyncio
import pytest
from unittest import mock
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from workflow_service.core.config import settings
from workflow_service.core.database import Base, get_db
from workflow_service.main import app

@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()

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

# Mock Kafka producer
@pytest.fixture(autouse=True)
def mock_kafka():
    mock_prod = mock.AsyncMock()
    with mock.patch("workflow_service.core.kafka.get_producer", return_value=mock_prod) as mock_get:
        yield mock_get

# Async client for executing requests against the test application
@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
