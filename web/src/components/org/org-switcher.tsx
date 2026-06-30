"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth-store";
import api from "@/lib/api";
import type { Organization } from "@/types";

export function OrgSwitcher() {
  const router = useRouter();
  const { org, setOrg, setToken, token } = useAuthStore();
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    queueMicrotask(() => setLoading(true));
    api.get<Organization[]>("/api/v1/orgs/").then((r) => {
      setOrgs(r.data);
      // auto-select first org if none active
      if (!org && r.data.length > 0) switchOrg(r.data[0]);
    }).catch(() => {}).finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function switchOrg(target: Organization) {
    if (target.id === org?.id) { setOpen(false); return; }
    setSwitching(target.id);
    try {
      const res = await api.post<{ access_token: string; refresh_token: string }>("/api/v1/auth/switch-org", {
        org_id: target.id,
      });
      // Store new token with new org_id embedded, then set active org
      setToken(res.data.access_token);
      setOrg(target);
      setOpen(false);
      router.refresh();
    } catch {
      // silently ignore
    } finally {
      setSwitching(null);
    }
  }

  const initials = org?.name
    ?.split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) ?? "??";

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-muted transition-colors text-left"
      >
        {/* Org avatar */}
        <div className="h-6 w-6 rounded-md bg-primary flex items-center justify-center shrink-0">
          <span className="text-[10px] font-bold text-primary-foreground">{initials}</span>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate leading-none">
            {org?.name ?? "Select workspace"}
          </p>
          {org?.plan && (
            <p className="text-[10px] text-muted-foreground mt-0.5 capitalize">{org.plan}</p>
          )}
        </div>
        <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      </button>

      {/* Org picker dropdown (simple panel, no Radix needed) */}
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-3 top-[110px] z-50 w-56 bg-card border border-border rounded-xl shadow-lg py-1.5 overflow-hidden">
            <p className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Workspaces
            </p>

            {loading && (
              <div className="flex justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}

            {orgs.map((o) => (
              <button
                key={o.id}
                onClick={() => switchOrg(o)}
                disabled={switching === o.id}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted transition-colors text-left",
                  o.id === org?.id && "text-primary font-medium"
                )}
              >
                <div className="h-5 w-5 rounded bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-[9px] font-bold text-primary">
                    {o.name.slice(0, 2).toUpperCase()}
                  </span>
                </div>
                <span className="flex-1 truncate">{o.name}</span>
                {switching === o.id
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : o.id === org?.id && <Check className="h-3 w-3" />}
              </button>
            ))}

            {orgs.length === 0 && !loading && (
              <p className="px-3 py-2 text-sm text-muted-foreground">No workspaces yet.</p>
            )}
          </div>
        </>
      )}
    </>
  );
}
