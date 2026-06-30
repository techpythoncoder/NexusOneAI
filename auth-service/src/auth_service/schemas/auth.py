import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str | None = Field(default=None, max_length=255)

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if not any(c.isupper() for c in v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one digit")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    totp_code: str | None = None   # Required if MFA is enabled on the account


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int       # seconds until access token expires


class RefreshRequest(BaseModel):
    refresh_token: str


class ValidateResponse(BaseModel):
    """
    Returned by GET /api/v1/auth/validate — called by nginx auth_request.
    The nginx gateway reads these as response headers (X-User-ID etc.) and
    injects them into the upstream request.
    """
    user_id: uuid.UUID
    org_id: uuid.UUID | None
    user_role: str
    user_email: str


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class MFASetupResponse(BaseModel):
    secret: str
    qr_code_uri: str       # otpauth:// URI to display as QR


class MFAVerifyRequest(BaseModel):
    totp_code: str = Field(min_length=6, max_length=6)


class OAuthCallbackQuery(BaseModel):
    code: str
    state: str | None = None
