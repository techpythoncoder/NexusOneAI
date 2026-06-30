"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { useAuthStore } from "@/store/auth-store";
import api from "@/lib/api";
import type { Organization } from "@/types";
import { getMembershipRoute } from "@/lib/auth-routing";
import { getTenantSlug, getRedirectUrlForOrg } from "@/lib/utils";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { token, org, setOrg, setToken } = useAuthStore();
  const [hydrated, setHydrated] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => { queueMicrotask(() => setHydrated(true)); }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!token) { router.replace("/login"); return; }

    async function prepareExperience() {
      try {
        const orgsRes = await api.get<Organization[]>("/api/v1/orgs/");
        const organizations = orgsRes.data;
        const tenant = getTenantSlug();

        if (!tenant) {
          const defaultOrg = organizations[0];
          if (defaultOrg) {
            const route = await getMembershipRoute(defaultOrg);
            const redirectUrl = getRedirectUrlForOrg(defaultOrg, route);
            if (redirectUrl.startsWith("http")) {
              window.location.href = redirectUrl;
            } else {
              router.replace(route);
            }
          } else {
            router.replace("/signup");
          }
          return;
        }

        const matchedOrg = organizations.find((o) => o.slug === tenant);
        if (!matchedOrg) {
          const fallbackOrg = organizations[0];
          if (fallbackOrg) {
            const route = await getMembershipRoute(fallbackOrg);
            const redirectUrl = getRedirectUrlForOrg(fallbackOrg, route);
            if (redirectUrl.startsWith("http")) {
              window.location.href = redirectUrl;
            } else {
              router.replace(route);
            }
          } else {
            router.replace("/signup");
          }
          return;
        }

        if (!org || org.id !== matchedOrg.id) {
          setOrg(matchedOrg);
          const switchRes = await api.post<{ access_token: string }>("/api/v1/auth/switch-org", {
            org_id: matchedOrg.id,
          });
          setToken(switchRes.data.access_token);
        }

        const route = await getMembershipRoute(matchedOrg);
        if (route === "/admin" && pathname === "/") {
          router.replace("/admin");
          return;
        }
        
        setReady(true);
      } catch {
        setReady(true);
      }
    }

    void prepareExperience();
  }, [hydrated, token, pathname]);

  if (!hydrated || !token || !ready) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header />
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
