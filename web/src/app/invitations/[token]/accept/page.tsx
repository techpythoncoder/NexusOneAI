"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Building2, Loader2, Zap, CheckCircle2, XCircle, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuthStore } from "@/store/auth-store";
import api from "@/lib/api";
import { routeForRole } from "@/lib/auth-routing";

interface InvitePreview {
  organization_id: string;
  organization_name: string;
  organization_slug: string;
  invitee_email: string;
  role: string;
  expires_at: string;
}

type PageState = "loading" | "preview" | "accepting" | "done" | "error" | "unauthenticated";

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};

export default function AcceptInvitationPage() {
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";

  const { token: authToken, setOrg, setToken } = useAuthStore();
  const [state, setState] = useState<PageState>("loading");
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    api.get<InvitePreview>(`/api/v1/orgs/invitations/${token}`)
      .then((r) => {
        setPreview(r.data);
        setState(authToken ? "preview" : "unauthenticated");
      })
      .catch((err) => {
        const detail = err?.response?.data?.detail;
        setErrorMsg(typeof detail === "string" ? detail : "This invitation link is invalid or has already been used.");
        setState("error");
      });
  }, [authToken, token]);

  async function accept() {
    setState("accepting");
    try {
      const membership = await api.post<{ organization_id: string; role: string }>(
        `/api/v1/orgs/invitations/${token}/accept`,
        {}
      );
      const orgId = membership.data.organization_id;

      // Fetch full org to populate the store
      const orgsRes = await api.get<Array<{ id: string; name: string; slug: string; plan: string }>>(
        "/api/v1/orgs/"
      );
      const joinedOrg = orgsRes.data.find((o) => o.id === orgId) ?? orgsRes.data[0];

      const switchRes = await api.post<{ access_token: string }>("/api/v1/auth/switch-org", { org_id: orgId });
      setToken(switchRes.data.access_token);
      if (joinedOrg) setOrg(joinedOrg as Parameters<typeof setOrg>[0]);

      setState("done");
      setTimeout(() => router.replace(routeForRole(membership.data.role)), 1800);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setErrorMsg(typeof msg === "string" ? msg : "Failed to accept invitation.");
      setState("error");
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar */}
      <header className="flex items-center gap-2 px-8 py-5 border-b border-border">
        <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary">
          <Zap className="h-3.5 w-3.5 text-primary-foreground" />
        </div>
        <span className="font-bold text-base">NexusOne AI</span>
      </header>

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">

          {/* Loading */}
          {state === "loading" && (
            <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p className="text-sm">Loading your invitation…</p>
            </div>
          )}

          {/* Not logged in */}
          {state === "unauthenticated" && (
            <div className="bg-card border border-border rounded-2xl p-8 text-center space-y-5">
              <div className="flex justify-center">
                <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <ShieldAlert className="h-7 w-7 text-primary" />
                </div>
              </div>
              <div>
                <h2 className="font-bold text-lg">Sign in to accept your invitation</h2>
                <p className="text-sm text-muted-foreground mt-1.5">
                  You need a NexusOne AI account to join a workspace.
                </p>
              </div>
              <div className="flex flex-col gap-2.5">
                <Button onClick={() => router.push(`/login?redirect=${encodeURIComponent(window.location.pathname)}`)}>
                  Sign in
                </Button>
                <Button variant="outline" onClick={() => router.push(`/register?invite=${encodeURIComponent(token)}`)}>
                  Create an account
                </Button>
              </div>
            </div>
          )}

          {/* Preview — confirm before accepting */}
          {(state === "preview" || state === "accepting") && preview && (
            <div className="bg-card border border-border rounded-2xl p-8 space-y-6">
              <div className="flex flex-col items-center text-center gap-4">
                <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Building2 className="h-7 w-7 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-1">
                    You&apos;ve been invited to
                  </p>
                  <h2 className="font-bold text-xl">{preview.organization_name}</h2>
                  <Badge variant="secondary" className="mt-2 capitalize">
                    {ROLE_LABELS[preview.role] ?? preview.role}
                  </Badge>
                </div>
              </div>

              <div className="rounded-xl bg-muted/50 px-4 py-3 text-sm text-muted-foreground text-center">
                This invitation was sent to <span className="font-medium text-foreground">{preview.invitee_email}</span>
              </div>

              <Button
                className="w-full"
                size="lg"
                onClick={accept}
                disabled={state === "accepting"}
              >
                {state === "accepting"
                  ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Joining…</>
                  : <>Accept invitation &amp; join {preview.organization_name}</>}
              </Button>

              <p className="text-xs text-center text-muted-foreground">
                By accepting, you agree to collaborate within this workspace under your current account.
              </p>
            </div>
          )}

          {/* Success */}
          {state === "done" && (
            <div className="bg-card border border-border rounded-2xl p-8 text-center space-y-4">
              <div className="flex justify-center">
                <div className="h-14 w-14 rounded-2xl bg-green-500/10 flex items-center justify-center">
                  <CheckCircle2 className="h-7 w-7 text-green-500" />
                </div>
              </div>
              <div>
                <h2 className="font-bold text-lg">You&apos;re in!</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Taking you to your new workspace…
                </p>
              </div>
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mx-auto" />
            </div>
          )}

          {/* Error */}
          {state === "error" && (
            <div className="bg-card border border-destructive/30 rounded-2xl p-8 text-center space-y-4">
              <div className="flex justify-center">
                <div className="h-14 w-14 rounded-2xl bg-destructive/10 flex items-center justify-center">
                  <XCircle className="h-7 w-7 text-destructive" />
                </div>
              </div>
              <div>
                <h2 className="font-bold text-lg">Invitation not valid</h2>
                <p className="text-sm text-muted-foreground mt-1">{errorMsg}</p>
              </div>
              <div className="flex flex-col gap-2">
                {errorMsg.includes("sign in") || errorMsg.includes("sent to") ? (
                  <Button onClick={() => { router.push(`/login?redirect=${encodeURIComponent(window.location.pathname)}`); }}>
                    Sign in with correct account
                  </Button>
                ) : null}
                <Button variant="outline" onClick={() => router.push("/onboarding")}>
                  Go to onboarding
                </Button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
