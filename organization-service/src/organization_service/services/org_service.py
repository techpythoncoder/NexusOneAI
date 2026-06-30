import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from organization_service.core.config import settings
from organization_service.core.exceptions import BadRequestError, ConflictError, ForbiddenError, NotFoundError
from organization_service.models.department import Department
from organization_service.models.invitation import Invitation, InvitationStatus
from organization_service.models.membership import Membership, MemberRole, MemberStatus
from organization_service.models.organization import Organization
from organization_service.schemas.membership import InviteMemberRequest
from organization_service.schemas.organization import DepartmentCreate, OrganizationCreate, OrganizationUpdate


def _make_slug(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug[:80]


async def get_org_or_404(db: AsyncSession, org_id: uuid.UUID) -> Organization:
    result = await db.execute(select(Organization).where(Organization.id == org_id, Organization.is_active == True))  # noqa: E712
    org = result.scalar_one_or_none()
    if not org:
        raise NotFoundError("Organization")
    return org


async def get_membership_or_403(
    db: AsyncSession, org_id: uuid.UUID, user_id: uuid.UUID
) -> Membership:
    result = await db.execute(
        select(Membership).where(
            Membership.organization_id == org_id,
            Membership.user_id == user_id,
            Membership.status == MemberStatus.ACTIVE,
        )
    )
    m = result.scalar_one_or_none()
    if not m:
        raise ForbiddenError("You are not a member of this organization")
    return m


def require_role(membership: Membership, *roles: MemberRole) -> None:
    if membership.role not in roles:
        raise ForbiddenError(f"Role '{membership.role}' cannot perform this action")


# ── Organization CRUD ─────────────────────────────────────────────────────────

async def create_organization(
    db: AsyncSession,
    data: OrganizationCreate,
    owner_id: uuid.UUID,
    owner_email: str,
    owner_name: str = "",
) -> Organization:
    slug = data.slug or _make_slug(data.name)

    # Ensure slug uniqueness — append random suffix if taken
    existing = await db.execute(select(Organization).where(Organization.slug == slug))
    if existing.scalar_one_or_none():
        slug = f"{slug}-{secrets.token_hex(3)}"

    org = Organization(
        name=data.name,
        slug=slug,
        description=data.description,
        website=data.website,
        owner_id=owner_id,
    )
    db.add(org)
    await db.flush()

    # Owner automatically becomes a member with owner role
    membership = Membership(
        organization_id=org.id,
        user_id=owner_id,
        user_email=owner_email,
        user_name=owner_name or None,
        role=MemberRole.OWNER,
    )
    db.add(membership)
    await db.flush()
    return org


async def update_organization(
    db: AsyncSession,
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    data: OrganizationUpdate,
) -> Organization:
    org = await get_org_or_404(db, org_id)
    membership = await get_membership_or_403(db, org_id, user_id)
    require_role(membership, MemberRole.OWNER, MemberRole.ADMIN)

    if data.name is not None:
        org.name = data.name
    if data.description is not None:
        org.description = data.description
    if data.logo_url is not None:
        org.logo_url = data.logo_url
    if data.website is not None:
        org.website = data.website
    if data.settings is not None:
        org.settings = {**org.settings, **data.settings}
    return org


async def delete_organization(
    db: AsyncSession, org_id: uuid.UUID, user_id: uuid.UUID
) -> None:
    org = await get_org_or_404(db, org_id)
    membership = await get_membership_or_403(db, org_id, user_id)
    require_role(membership, MemberRole.OWNER)
    org.is_active = False


async def list_user_organizations(db: AsyncSession, user_id: uuid.UUID) -> list[Organization]:
    result = await db.execute(
        select(Organization)
        .join(Membership, Membership.organization_id == Organization.id)
        .where(
            Membership.user_id == user_id,
            Membership.status == MemberStatus.ACTIVE,
            Organization.is_active == True,  # noqa: E712
        )
    )
    return list(result.scalars().all())


# ── Membership ────────────────────────────────────────────────────────────────

async def list_members(db: AsyncSession, org_id: uuid.UUID) -> list[Membership]:
    result = await db.execute(
        select(Membership).where(
            Membership.organization_id == org_id,
            Membership.status == MemberStatus.ACTIVE,
        )
    )
    return list(result.scalars().all())


async def update_member_role(
    db: AsyncSession,
    org_id: uuid.UUID,
    target_user_id: uuid.UUID,
    new_role: MemberRole,
    actor_id: uuid.UUID,
) -> Membership:
    actor_membership = await get_membership_or_403(db, org_id, actor_id)
    require_role(actor_membership, MemberRole.OWNER, MemberRole.ADMIN)

    result = await db.execute(
        select(Membership).where(
            Membership.organization_id == org_id,
            Membership.user_id == target_user_id,
        )
    )
    target = result.scalar_one_or_none()
    if not target:
        raise NotFoundError("Member")
    if target.role == MemberRole.OWNER:
        raise ForbiddenError("Cannot change the owner's role")
    if new_role == MemberRole.OWNER:
        raise ForbiddenError("Use transfer-ownership endpoint to change owner")
    target.role = new_role
    return target


async def remove_member(
    db: AsyncSession,
    org_id: uuid.UUID,
    target_user_id: uuid.UUID,
    actor_id: uuid.UUID,
) -> str:
    actor_membership = await get_membership_or_403(db, org_id, actor_id)
    require_role(actor_membership, MemberRole.OWNER)

    result = await db.execute(
        select(Membership).where(
            Membership.organization_id == org_id,
            Membership.user_id == target_user_id,
        )
    )
    target = result.scalar_one_or_none()
    if not target:
        raise NotFoundError("Member")
    if target.role == MemberRole.OWNER:
        raise ForbiddenError("Cannot remove the organization owner")
    user_email = target.user_email
    await db.delete(target)
    return user_email


async def cancel_invitation(
    db: AsyncSession,
    org_id: uuid.UUID,
    invitation_id: uuid.UUID,
    actor_id: uuid.UUID,
) -> None:
    actor_membership = await get_membership_or_403(db, org_id, actor_id)
    require_role(actor_membership, MemberRole.OWNER)

    result = await db.execute(
        select(Invitation).where(
            Invitation.id == invitation_id,
            Invitation.organization_id == org_id,
            Invitation.status == InvitationStatus.PENDING,
        )
    )
    invitation = result.scalar_one_or_none()
    if not invitation:
        raise NotFoundError("Invitation")
    invitation.status = InvitationStatus.CANCELLED


# ── Invitations ───────────────────────────────────────────────────────────────

async def invite_member(
    db: AsyncSession,
    org_id: uuid.UUID,
    data: InviteMemberRequest,
    actor_id: uuid.UUID,
) -> Invitation:
    org = await get_org_or_404(db, org_id)
    actor_membership = await get_membership_or_403(db, org_id, actor_id)
    require_role(actor_membership, MemberRole.OWNER, MemberRole.ADMIN)

    # Check member limit
    count_result = await db.execute(
        select(func.count()).select_from(Membership).where(
            Membership.organization_id == org_id,
            Membership.status == MemberStatus.ACTIVE,
        )
    )
    count = count_result.scalar()
    if count >= org.max_members:
        raise BadRequestError(f"Organization has reached the member limit ({org.max_members})")

    # Check if already a member
    existing_member = await db.execute(
        select(Membership).where(
            Membership.organization_id == org_id,
            Membership.user_email == data.email.lower(),
        )
    )
    if existing_member.scalar_one_or_none():
        raise ConflictError("This user is already a member of this organization")

    # Cancel any pending invitation for same email
    pending = await db.execute(
        select(Invitation).where(
            Invitation.organization_id == org_id,
            Invitation.email == data.email.lower(),
            Invitation.status == InvitationStatus.PENDING,
        )
    )
    for inv in pending.scalars().all():
        inv.status = InvitationStatus.CANCELLED

    invitation = Invitation(
        organization_id=org_id,
        email=data.email.lower(),
        role=data.role.value,
        token=secrets.token_urlsafe(32),
        invited_by=actor_id,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=settings.INVITATION_EXPIRE_HOURS),
    )
    db.add(invitation)
    await db.flush()
    return invitation


async def list_org_invitations(
    db: AsyncSession,
    org_id: uuid.UUID,
    actor_id: uuid.UUID,
) -> list[Invitation]:
    await get_org_or_404(db, org_id)
    actor_membership = await get_membership_or_403(db, org_id, actor_id)
    require_role(actor_membership, MemberRole.OWNER, MemberRole.ADMIN)
    result = await db.execute(
        select(Invitation).where(
            Invitation.organization_id == org_id,
            Invitation.status == InvitationStatus.PENDING,
            Invitation.expires_at > datetime.now(timezone.utc),
        ).order_by(Invitation.created_at.desc())
    )
    return list(result.scalars().all())


async def accept_invitation(
    db: AsyncSession,
    token: str,
    user_id: uuid.UUID,
    user_email: str,
    user_name: str = "",
) -> Membership:
    result = await db.execute(
        select(Invitation).where(
            Invitation.token == token,
            Invitation.status == InvitationStatus.PENDING,
            Invitation.expires_at > datetime.now(timezone.utc),
        )
    )
    invitation = result.scalar_one_or_none()
    if not invitation:
        raise BadRequestError("Invalid or expired invitation token")

    # Ensure the logged-in user is the intended invitee
    if user_email.lower() != invitation.email.lower():
        raise ForbiddenError(
            f"This invitation was sent to {invitation.email}. "
            "Please sign in with that account to accept it."
        )

    # Check if already a member
    existing = await db.execute(
        select(Membership).where(
            Membership.organization_id == invitation.organization_id,
            Membership.user_id == user_id,
        )
    )
    if existing.scalar_one_or_none():
        raise ConflictError("You are already a member of this organization")

    # Create membership
    membership = Membership(
        organization_id=invitation.organization_id,
        user_id=user_id,
        user_email=user_email,
        user_name=user_name or None,
        role=MemberRole(invitation.role),
        invited_by=invitation.invited_by,
    )
    db.add(membership)

    invitation.status = InvitationStatus.ACCEPTED
    invitation.accepted_at = datetime.now(timezone.utc)
    await db.flush()
    return membership


async def get_invitation_preview(db: AsyncSession, token: str) -> dict:
    result = await db.execute(
        select(Invitation, Organization)
        .join(Organization, Organization.id == Invitation.organization_id)
        .where(
            Invitation.token == token,
            Invitation.status == InvitationStatus.PENDING,
            Invitation.expires_at > datetime.now(timezone.utc),
        )
    )
    row = result.first()
    if not row:
        raise BadRequestError("Invalid or expired invitation token")
    invitation, org = row
    return {
        "organization_id": org.id,
        "organization_name": org.name,
        "organization_slug": org.slug,
        "invitee_email": invitation.email,
        "role": invitation.role,
        "expires_at": invitation.expires_at,
    }


# ── Departments ───────────────────────────────────────────────────────────────

async def create_department(
    db: AsyncSession,
    org_id: uuid.UUID,
    data: DepartmentCreate,
    actor_id: uuid.UUID,
) -> Department:
    actor_membership = await get_membership_or_403(db, org_id, actor_id)
    require_role(actor_membership, MemberRole.OWNER, MemberRole.ADMIN)

    if data.parent_id:
        parent = await db.get(Department, data.parent_id)
        if not parent or parent.organization_id != org_id:
            raise NotFoundError("Parent department")
        if parent.parent_id is not None:
            raise BadRequestError("Departments only support one level of nesting")

    dept = Department(
        organization_id=org_id,
        name=data.name,
        description=data.description,
        parent_id=data.parent_id,
        created_by=actor_id,
    )
    db.add(dept)
    await db.flush()
    return dept


async def list_departments(db: AsyncSession, org_id: uuid.UUID) -> list[Department]:
    result = await db.execute(
        select(Department).where(Department.organization_id == org_id)
    )
    return list(result.scalars().all())
