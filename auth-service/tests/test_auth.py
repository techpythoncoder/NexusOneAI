import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_register_and_login_flow(client: AsyncClient):
    # 1. Register a new user
    register_payload = {
        "email": "user@example.com",
        "password": "Password123",
        "full_name": "Test User",
    }
    
    reg_resp = await client.post("/api/v1/auth/register", json=register_payload)
    assert reg_resp.status_code == 201
    reg_data = reg_resp.json()
    assert reg_data["email"] == "user@example.com"
    assert reg_data["full_name"] == "Test User"
    assert "id" in reg_data
    
    # 2. Try to register with the same email (should fail with 409)
    dup_resp = await client.post("/api/v1/auth/register", json=register_payload)
    assert dup_resp.status_code == 409
    assert "already exists" in dup_resp.json()["detail"]

    # 3. Register with weak password (should fail with 422)
    weak_payload = {
        "email": "weak@example.com",
        "password": "password",  # No uppercase or digits
        "full_name": "Weak User",
    }
    weak_resp = await client.post("/api/v1/auth/register", json=weak_payload)
    assert weak_resp.status_code == 422

    # 4. Login with correct credentials
    login_payload = {
        "email": "user@example.com",
        "password": "Password123",
    }
    login_resp = await client.post("/api/v1/auth/login", json=login_payload)
    assert login_resp.status_code == 200
    login_data = login_resp.json()
    assert "access_token" in login_data
    assert "refresh_token" in login_data
    assert login_data["token_type"] == "bearer"

    # 5. Login with incorrect password (should fail with 401)
    wrong_payload = {
        "email": "user@example.com",
        "password": "WrongPassword",
    }
    wrong_resp = await client.post("/api/v1/auth/login", json=wrong_payload)
    assert wrong_resp.status_code == 401
    assert "Invalid email or password" in wrong_resp.json()["detail"]
