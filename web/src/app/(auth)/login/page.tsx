"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useAuthStore } from "@/store/auth-store";
import api from "@/lib/api";
import { getMembershipRoute } from "@/lib/auth-routing";
import type { Organization } from "@/types";
import { getTenantSlug, getRedirectUrlForOrg } from "@/lib/utils";

const schema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(1, "Password required"),
});
type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setAuth, setOrg } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [noAccountEmail, setNoAccountEmail] = useState("");

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  // If coming from an invite redirect, extract the token for the register link
  const redirectParam = searchParams.get("redirect") ?? "";
  const inviteTokenFromRedirect = redirectParam.match(/\/invitations\/([^/]+)\/accept/)?.[1] ?? "";

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    setNoAccountEmail("");
    try {
      const res = await api.post("/api/v1/auth/login", data);
      const { access_token, refresh_token } = res.data;
      if (refresh_token) localStorage.setItem("nexus_refresh_token", refresh_token);
      const meRes = await api.get("/api/v1/users/me", {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      setAuth(access_token, meRes.data);

      const orgsRes = await api.get<Organization[]>("/api/v1/orgs/", {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      const activeOrg = orgsRes.data[0] ?? null;
      if (activeOrg) setOrg(activeOrg);

      const redirect = searchParams.get("redirect");
      const roleRoute = activeOrg ? await getMembershipRoute(activeOrg) : "/signup";
      const targetUrl = redirect ?? roleRoute;

      if (activeOrg && !redirect) {
        const fullRedirectUrl = getRedirectUrlForOrg(activeOrg, targetUrl);
        if (fullRedirectUrl.startsWith("http")) {
          window.location.href = fullRedirectUrl;
          return;
        }
      }
      router.push(targetUrl);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "";
      if (detail.includes("No account found")) {
        setNoAccountEmail(data.email);
      } else {
        toast.error(detail || "Invalid email or password");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = (provider: "google" | "github") => {
    const tenant = getTenantSlug();
    const query = tenant ? `?tenant=${tenant}` : "";
    window.location.href = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/v1/auth/oauth/${provider}/authorize${query}`;
  };

  return (
    <Card className="border-border/50 shadow-2xl">
      <CardHeader className="space-y-1 text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Zap className="h-6 w-6 text-primary" />
          <span className="font-bold text-xl">NexusOne AI</span>
        </div>
        <CardTitle className="text-2xl">Welcome back</CardTitle>
        <CardDescription>Sign in to your account</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {searchParams.get("error") && (
          <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">
            {searchParams.get("error") === "oauth_failed"
              ? `Sign-in failed: ${searchParams.get("detail") || "please try again"}`
              : `Error: ${searchParams.get("error")}`}
          </div>
        )}
        {noAccountEmail && (
          <div className="rounded-md bg-amber-50 border border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/20 px-3 py-3 space-y-2">
            <p className="text-sm text-amber-800 dark:text-amber-400 font-medium">No account found for {noAccountEmail}</p>
            <p className="text-xs text-amber-700 dark:text-amber-500">You need to register first. Use the invitation link sent to your email.</p>
            {inviteTokenFromRedirect && (
              <a
                href={`/register?invite=${inviteTokenFromRedirect}`}
                className="block text-xs font-medium text-amber-800 dark:text-amber-400 underline underline-offset-2"
              >
                Register with your invitation →
              </a>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Button variant="outline" onClick={() => handleOAuth("google")} className="gap-2">
            <svg viewBox="0 0 24 24" className="h-4 w-4"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Google
          </Button>
          <Button variant="outline" onClick={() => handleOAuth("github")} className="gap-2">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
            GitHub
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Separator className="flex-1" />
          <span className="text-xs text-muted-foreground">or</span>
          <Separator className="flex-1" />
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="you@example.com" {...register("email")} />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link href="/forgot-password" className="text-xs text-muted-foreground hover:text-primary">Forgot?</Link>
            </div>
            <Input id="password" type="password" placeholder="••••••••" {...register("password")} />
            {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Sign in
          </Button>
        </form>
        <p className="text-center text-sm text-muted-foreground">
          Creating a company workspace?{" "}
          <Link href="/signup" className="text-primary hover:underline font-medium">Start here</Link>
        </p>
      </CardContent>
    </Card>
  );
}
