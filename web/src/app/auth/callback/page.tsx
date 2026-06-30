"use client";

import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuthStore } from "@/store/auth-store";
import api from "@/lib/api";
import { getMembershipRoute } from "@/lib/auth-routing";
import type { Organization } from "@/types";
import { getRedirectUrlForOrg } from "@/lib/utils";

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setAuth, setOrg } = useAuthStore();

  useEffect(() => {
    const accessToken = searchParams.get("access_token");
    const refreshToken = searchParams.get("refresh_token");
    const error = searchParams.get("error");

    if (error || !accessToken) {
      router.replace("/login?error=oauth_failed");
      return;
    }
    if (refreshToken) localStorage.setItem("nexus_refresh_token", refreshToken);

    api
      .get("/api/v1/users/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      .then((res) => {
        setAuth(accessToken, res.data);
        return api.get<Organization[]>("/api/v1/orgs/", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      })
      .then(async (orgsRes) => {
        const org = orgsRes.data[0] ?? null;
        if (org) setOrg(org);
        let targetUrl = "/onboarding";
        if (org) {
          try {
            targetUrl = await getMembershipRoute(org);
          } catch {
            targetUrl = "/";
          }
          const fullRedirectUrl = getRedirectUrlForOrg(org, targetUrl);
          if (fullRedirectUrl.startsWith("http")) {
            window.location.href = fullRedirectUrl;
            return;
          }
        }
        router.replace(targetUrl);
      })
      .catch((err) => {
        const status = err?.response?.status;
        const msg = err?.response?.data?.detail || err?.message || "unknown";
        console.error("OAuth callback error:", status, msg, err);
        router.replace(`/login?error=oauth_failed&detail=${encodeURIComponent(msg)}`);
      });
  }, [searchParams, setAuth, setOrg, router]);

  return (
    <div className="flex flex-col items-center gap-3 text-muted-foreground">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm">Signing you in…</p>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Suspense fallback={
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm">Loading callback...</p>
        </div>
      }>
        <CallbackHandler />
      </Suspense>
    </div>
  );
}
