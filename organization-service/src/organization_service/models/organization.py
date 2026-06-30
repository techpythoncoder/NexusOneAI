"""
Organization — a tenant in NexusOne.

Every piece of data in every service is scoped to an organization_id.
One user can belong to many organizations (via memberships table).
The organization is the billing and permission boundary.
"""

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Enum, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from organization_service.core.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Plan(str, enum.Enum):
    FREE = "free"
    STARTER = "starter"
    PRO = "pro"
    ENTERPRISE = "enterprise"


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    logo_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    website: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # The user_id from auth-service who created this org (not an FK — cross-service)
    owner_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)

    plan: Mapped[Plan] = mapped_column(Enum(Plan), default=Plan.FREE, nullable=False)
    max_members: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    max_projects: Mapped[int] = mapped_column(Integer, default=3, nullable=False)

    # Flexible org-level settings (timezone, locale, feature flags, etc.)
    settings: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    # Relationships
    memberships: Mapped[list["Membership"]] = relationship(back_populates="organization", cascade="all, delete-orphan")
    departments: Mapped[list["Department"]] = relationship(back_populates="organization", cascade="all, delete-orphan")
    invitations: Mapped[list["Invitation"]] = relationship(back_populates="organization", cascade="all, delete-orphan")


from organization_service.models.membership import Membership    # noqa: E402, F401
from organization_service.models.department import Department    # noqa: E402, F401
from organization_service.models.invitation import Invitation    # noqa: E402, F401
