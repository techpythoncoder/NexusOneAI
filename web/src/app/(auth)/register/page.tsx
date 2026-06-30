"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Building2, Loader2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import api from "@/lib/api";
import { routeForRole } from "@/lib/auth-routing";
import { useAuthStore } from "@/store/auth-store";
import type { Organization, User } from "@/types";

const schema = z.object({
  full_name: z.string().min(2, "Name must be at least 2 characters"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirm_password: z.string(),
}).refine((d) => d.password === d.confirm_password, {
  message: "Passwords don't match",
  path: ["confirm_password"],
});

type FormData = z.infer<typeof schema>;

interface InvitePreview {
  organization_id: string;
  organization_name: string;
  invitee_email: string;
  role: string;
}

export default function RegisterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("invite");
  const { setAuth, setOrg, setToken } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(!!inviteToken);
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (!inviteToken) return;
    queueMicrotask(() => setPreviewLoading(true));
    api.get<InvitePreview>(`/api/v1/orgs/invitations/${inviteToken}`)
      .then((r) => setPreview(r.data))
      .catch(() => toast.error("Invalid or expired invitation"))
      .finally(() => setPreviewLoading(false));
  }, [inviteToken]);

  async function onSubmit(data: FormData) {
    if (!inviteToken || !preview) {
      toast.error("Registration requires an invitation link");
      return;
    }
    setLoading(true);
    try {
      await api.post<User>("/api/v1/auth/register", {
        full_name: data.full_name,
        email: preview.invitee_email,
        password: data.password,
      });

      const login = await api.post("/api/v1/auth/login", {
        email: preview.invitee_email,
        password: data.password,
      });
      const accessToken = login.data.access_token;
      const me = await api.get<User>("/api/v1/users/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setAuth(accessToken, me.data);

      const membership = await api.post<{ organization_id: string; role: string }>(
        `/api/v1/orgs/invitations/${inviteToken}/accept`,
        {}
      );
      const orgs = await api.get<Organization[]>("/api/v1/orgs/");
      const joinedOrg = orgs.data.find((o) => o.id === membership.data.organization_id) ?? null;
      const switchRes = await api.post<{ access_token: string }>("/api/v1/auth/switch-org", {
        org_id: membership.data.organization_id,
      });
      setToken(switchRes.data.access_token);
      if (joinedOrg) setOrg(joinedOrg);
      toast.success(`Joined ${preview.organization_name}`);
      router.replace(routeForRole(membership.data.role));
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg || "Could not accept invitation");
    } finally {
      setLoading(false);
    }
  }

  if (!inviteToken) {
    return (
      <Card className="border-border/50 shadow-2xl">
        <CardHeader className="space-y-1 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Zap className="h-6 w-6 text-primary" />
            <span className="font-bold text-xl">NexusOne AI</span>
          </div>
          <CardTitle className="text-2xl">Check your email</CardTitle>
          <CardDescription>
            To create an account, use the invitation link sent to your email by your organization admin.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md bg-muted px-4 py-3 text-sm text-muted-foreground text-center">
            No invitation link found. Contact your organization admin to send you an invite.
          </div>
          <Link href="/login"><Button variant="outline" className="w-full">Sign in instead</Button></Link>
        </CardContent>
      </Card>
    );
  }

  if (previewLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card className="border-border/50 shadow-2xl">
      <CardHeader className="space-y-1 text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Zap className="h-6 w-6 text-primary" />
          <span className="font-bold text-xl">NexusOne AI</span>
        </div>
        <CardTitle className="text-2xl">Join {preview?.organization_name}</CardTitle>
        <CardDescription className="flex items-center justify-center gap-1.5">
          <Building2 className="h-3.5 w-3.5" />
          Invitation for {preview?.invitee_email}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="full_name">Full name</Label>
            <Input id="full_name" placeholder="John Doe" {...register("full_name")} />
            {errors.full_name && <p className="text-xs text-destructive">{errors.full_name.message}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" readOnly value={preview?.invitee_email ?? ""} className="bg-muted" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" placeholder="At least 8 characters, 1 uppercase, 1 digit" {...register("password")} />
            {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="confirm_password">Confirm password</Label>
            <Input id="confirm_password" type="password" placeholder="Repeat password" {...register("confirm_password")} />
            {errors.confirm_password && <p className="text-xs text-destructive">{errors.confirm_password.message}</p>}
          </div>
          <Button type="submit" className="w-full mt-2" disabled={loading || !preview}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create account and join
          </Button>
        </form>
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href={`/invitations/${inviteToken}/accept`} className="text-primary hover:underline font-medium">Accept invitation</Link>
        </p>
      </CardContent>
    </Card>
  );
}
