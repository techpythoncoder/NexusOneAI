"""
Organization routes.

All routes here read user identity from X-User-ID / X-Org-ID headers injected
by nginx — no JWT libraries, no token parsing. Just header reads.
"""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from organization_service.core.database import get_db
from organization_service.core.deps import RequestContext, get_request_context
from organization_service.core.kafka import publish_org_event
from organization_service.schemas.membership import (
    InviteMemberRequest,
    InvitationPreviewResponse,
    InvitationResponse,
    MembershipResponse,
    RemoveMemberRequest,
    UpdateMemberRoleRequest,
)
from organization_service.schemas.organization import (
    DepartmentCreate,
    DepartmentResponse,
    OrganizationCreate,
    OrganizationResponse,
    OrganizationUpdate,
)
from organization_service.core import search as search_index
from organization_service.services import org_service

router = APIRouter(prefix="/api/v1/orgs", tags=["organizations"])


# ── CRUD ──────────────────────────────────────────────────────────────────────

@router.post("/", response_model=OrganizationResponse, status_code=201)
async def create_organization(
    body: OrganizationCreate,
    ctx: RequestContext = Depends(get_request_context),
    db: AsyncSession = Depends(get_db),
):
    org = await org_service.create_organization(db, body, ctx.user_id, ctx.user_email, ctx.user_name)
    await publish_org_event("org.created", {
        "organization_id": str(org.id),
        "name": org.name,
        "slug": org.slug,
        "owner_id": str(ctx.user_id),
    })
    return org


@router.get("/", response_model=list[OrganizationResponse])
async def list_my_organizations(
    ctx: RequestContext = Depends(get_request_context),
    db: AsyncSession = Depends(get_db),
):
    return await org_service.list_user_organizations(db, ctx.user_id)


@router.get("/{org_id}", response_model=OrganizationResponse)
async def get_organization(
    org_id: uuid.UUID,
    ctx: RequestContext = Depends(get_request_context),
    db: AsyncSession = Depends(get_db),
):
    await org_service.get_membership_or_403(db, org_id, ctx.user_id)
    return await org_service.get_org_or_404(db, org_id)


@router.patch("/{org_id}", response_model=OrganizationResponse)
async def update_organization(
    org_id: uuid.UUID,
    body: OrganizationUpdate,
    ctx: RequestContext = Depends(get_request_context),
    db: AsyncSession = Depends(get_db),
):
    return await org_service.update_organization(db, org_id, ctx.user_id, body)


@router.delete("/{org_id}", status_code=204)
async def delete_organization(
    org_id: uuid.UUID,
    ctx: RequestContext = Depends(get_request_context),
    db: AsyncSession = Depends(get_db),
):
    await org_service.delete_organization(db, org_id, ctx.user_id)
    await publish_org_event("org.deleted", {"organization_id": str(org_id)})


# ── Members ───────────────────────────────────────────────────────────────────

@router.get("/{org_id}/members", response_model=list[MembershipResponse])
async def list_members(
    org_id: uuid.UUID,
    ctx: RequestContext = Depends(get_request_context),
    db: AsyncSession = Depends(get_db),
):
    await org_service.get_membership_or_403(db, org_id, ctx.user_id)
    return await org_service.list_members(db, org_id)


@router.get("/{org_id}/members/me", response_model=MembershipResponse)
async def get_my_membership(
    org_id: uuid.UUID,
    ctx: RequestContext = Depends(get_request_context),
    db: AsyncSession = Depends(get_db),
):
    return await org_service.get_membership_or_403(db, org_id, ctx.user_id)


@router.patch("/{org_id}/members/{user_id}", response_model=MembershipResponse)
async def update_member_role(
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    body: UpdateMemberRoleRequest,
    ctx: RequestContext = Depends(get_request_context),
    db: AsyncSession = Depends(get_db),
):
    membership = await org_service.update_member_role(db, org_id, user_id, body.role, ctx.user_id)
    search_index.index_member(str(user_id), str(org_id), membership.user_email or "", membership.user_name, membership.role.value)
    return membership


@router.delete("/{org_id}/members/{user_id}", status_code=204)
async def remove_member(
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    body: RemoveMemberRequest,
    ctx: RequestContext = Depends(get_request_context),
    db: AsyncSession = Depends(get_db),
):
    org = await org_service.get_org_or_404(db, org_id)
    user_email = await org_service.remove_member(db, org_id, user_id, ctx.user_id)
    await publish_org_event("org.member.removed", {
        "organization_id": str(org_id),
        "organization_name": org.name,
        "user_id": str(user_id),
        "user_email": user_email,
        "removed_by": str(ctx.user_id),
        "reason": body.reason,
    })
    search_index.delete_member(str(user_id), str(org_id))


# ── Invitations ───────────────────────────────────────────────────────────────

@router.post("/{org_id}/invitations", response_model=InvitationResponse, status_code=201)
async def invite_member(
    org_id: uuid.UUID,
    body: InviteMemberRequest,
    ctx: RequestContext = Depends(get_request_context),
    db: AsyncSession = Depends(get_db),
):
    invitation = await org_service.invite_member(db, org_id, body, ctx.user_id)
    org = await org_service.get_org_or_404(db, org_id)
    await publish_org_event("org.member.invited", {
        "organization_id": str(org_id),
        "invitation_id": str(invitation.id),
        "email": invitation.email,
        "role": invitation.role,
        "token": invitation.token,
        "invited_by": str(ctx.user_id),
        "organization_name": org.name,
        "organization_slug": org.slug,
    })
    return invitation


@router.delete("/{org_id}/invitations/{invitation_id}", status_code=204)
async def cancel_invitation(
    org_id: uuid.UUID,
    invitation_id: uuid.UUID,
    ctx: RequestContext = Depends(get_request_context),
    db: AsyncSession = Depends(get_db),
):
    await org_service.cancel_invitation(db, org_id, invitation_id, ctx.user_id)


@router.get("/{org_id}/invitations", response_model=list[InvitationResponse])
async def list_org_invitations(
    org_id: uuid.UUID,
    ctx: RequestContext = Depends(get_request_context),
    db: AsyncSession = Depends(get_db),
):
    return await org_service.list_org_invitations(db, org_id, ctx.user_id)


@router.get("/invitations/{token}", response_model=InvitationPreviewResponse)
async def get_invitation_preview(
    token: str,
    db: AsyncSession = Depends(get_db),
):
    return await org_service.get_invitation_preview(db, token)


@router.post("/invitations/{token}/accept", response_model=MembershipResponse)
async def accept_invitation(
    token: str,
    ctx: RequestContext = Depends(get_request_context),
    db: AsyncSession = Depends(get_db),
):
    membership = await org_service.accept_invitation(db, token, ctx.user_id, ctx.user_email, ctx.user_name)
    org = await org_service.get_org_or_404(db, membership.organization_id)
    await publish_org_event("org.member.joined", {
        "organization_id": str(membership.organization_id),
        "organization_slug": org.slug,
        "user_id": str(ctx.user_id),
        "role": membership.role.value,
    })
    search_index.index_member(str(ctx.user_id), str(membership.organization_id), ctx.user_email, ctx.user_name, membership.role.value)
    return membership


# ── Departments ───────────────────────────────────────────────────────────────

@router.post("/{org_id}/departments", response_model=DepartmentResponse, status_code=201)
async def create_department(
    org_id: uuid.UUID,
    body: DepartmentCreate,
    ctx: RequestContext = Depends(get_request_context),
    db: AsyncSession = Depends(get_db),
):
    return await org_service.create_department(db, org_id, body, ctx.user_id)


@router.get("/{org_id}/departments", response_model=list[DepartmentResponse])
async def list_departments(
    org_id: uuid.UUID,
    ctx: RequestContext = Depends(get_request_context),
    db: AsyncSession = Depends(get_db),
):
    await org_service.get_membership_or_403(db, org_id, ctx.user_id)
    return await org_service.list_departments(db, org_id)
