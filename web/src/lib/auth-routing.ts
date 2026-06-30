import api from "@/lib/api";
import type { Membership, Organization } from "@/types";

export const ADMIN_ROLES = new Set(["owner", "admin"]);

export function routeForRole(role?: string | null) {
  return role && ADMIN_ROLES.has(role) ? "/admin" : "/";
}

export async function getMembershipRoute(org: Organization | null) {
  if (!org) return "/";
  const res = await api.get<Membership>(`/api/v1/orgs/${org.id}/members/me`);
  return routeForRole(res.data.role);
}
