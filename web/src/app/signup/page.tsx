"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Building2, Loader2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import api from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";
import type { Organization, User } from "@/types";
import { getTenantSlug } from "@/lib/utils";

const schema = z.object({
  company_name: z.string().min(2, "Company name is required"),
  full_name: z.string().min(2, "Your name is required"),
  email: z.string().email("Invalid email"),
  password: z.string().min(8, "Use at least 8 characters"),
});
type FormData = z.infer<typeof schema>;

const loggedInSchema = z.object({
  company_name: z.string().min(2, "Company name is required"),
});
type LoggedInFormData = z.infer<typeof loggedInSchema>;

function slugFromName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export default function OrganizationSignupPage() {
  const router = useRouter();
  const { token, user, setAuth, setOrg, setToken, logout } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [companySlug, setCompanySlug] = useState("");

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const { register: registerLoggedIn, handleSubmit: handleSubmitLoggedIn, formState: { errors: errorsLoggedIn } } = useForm<LoggedInFormData>({
    resolver: zodResolver(loggedInSchema),
  });

  const handleOAuth = (provider: "google" | "github") => {
    const tenant = getTenantSlug();
    const query = tenant ? `?tenant=${tenant}` : "";
    window.location.href = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/v1/auth/oauth/${provider}/authorize${query}`;
  };

  async function onSubmitLoggedIn(data: LoggedInFormData) {
    setLoading(true);
    try {
      const orgRes = await api.post<Organization>("/api/v1/orgs/", {
        name: data.company_name,
        slug: slugFromName(data.company_name),
      });
      const org = orgRes.data;
      const switchRes = await api.post<{ access_token: string }>("/api/v1/auth/switch-org", {
        org_id: org.id,
      });
      setToken(switchRes.data.access_token);
      setOrg(org);
      toast.success("Company workspace created");
      
      const protocol = window.location.protocol;
      const host = window.location.host;
      window.location.href = `${protocol}//${org.slug}.${host}/login`;
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(typeof msg === "string" ? msg : "Could not create workspace");
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(data: FormData) {
    setLoading(true);
    try {
      await api.post<User>("/api/v1/auth/register", {
        email: data.email,
        password: data.password,
        full_name: data.full_name,
      });

      const login = await api.post("/api/v1/auth/login", {
        email: data.email,
        password: data.password,
      });
      const accessToken = login.data.access_token;
      const me = await api.get<User>("/api/v1/users/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setAuth(accessToken, me.data);

      const orgRes = await api.post<Organization>("/api/v1/orgs/", {
        name: data.company_name,
        slug: slugFromName(data.company_name),
      });
      const org = orgRes.data;
      const switchRes = await api.post<{ access_token: string }>("/api/v1/auth/switch-org", {
        org_id: org.id,
      });
      setToken(switchRes.data.access_token);
      setOrg(org);
      toast.success("Company workspace created");
      
      const protocol = window.location.protocol;
      const host = window.location.host;
      window.location.href = `${protocol}//${org.slug}.${host}/login`;
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(typeof msg === "string" ? msg : "Could not create workspace");
    } finally {
      setLoading(false);
    }
  }

  if (token && user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Card className="w-full max-w-xl border-border/50 shadow-2xl">
          <CardHeader className="space-y-1 text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Zap className="h-6 w-6 text-primary" />
              <span className="font-bold text-xl">NexusOne AI</span>
            </div>
            <CardTitle className="text-2xl flex items-center justify-center gap-2">
              <Building2 className="h-5 w-5" />
              Create your workspace
            </CardTitle>
            <CardDescription>
              Welcome, <span className="font-semibold text-foreground">{user.full_name || user.email}</span>! Let's create a workspace for your company.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmitLoggedIn(onSubmitLoggedIn)} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="company_name">Company name</Label>
                <Input
                  id="company_name"
                  placeholder="Acme Corp"
                  {...registerLoggedIn("company_name", { onChange: (e) => setCompanySlug(slugFromName(e.target.value)) })}
                />
                {errorsLoggedIn.company_name && <p className="text-xs text-destructive">{errorsLoggedIn.company_name.message}</p>}
                {companySlug && <p className="text-xs text-muted-foreground">Workspace slug: {companySlug}</p>}
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create workspace
              </Button>
            </form>
            <p className="text-center text-sm text-muted-foreground mt-4">
              Want to use a different account?{" "}
              <button onClick={() => logout()} className="text-primary hover:underline font-medium bg-transparent border-0 cursor-pointer">Sign out</button>
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <Card className="w-full max-w-xl border-border/50 shadow-2xl">
        <CardHeader className="space-y-1 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Zap className="h-6 w-6 text-primary" />
            <span className="font-bold text-xl">NexusOne AI</span>
          </div>
          <CardTitle className="text-2xl flex items-center justify-center gap-2">
            <Building2 className="h-5 w-5" />
            Create your company workspace
          </CardTitle>
          <CardDescription>One form creates the organization and the owner account.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <Button variant="outline" onClick={() => handleOAuth("google")} className="gap-2">
              <svg viewBox="0 0 24 24" className="h-4 w-4"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Google
            </Button>
            <Button variant="outline" onClick={() => handleOAuth("github")} className="gap-2">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
              GitHub
            </Button>
          </div>
          <div className="flex items-center gap-2 mb-4">
            <Separator className="flex-1" />
            <span className="text-xs text-muted-foreground">or</span>
            <Separator className="flex-1" />
          </div>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="company_name">Company name</Label>
                <Input
                  id="company_name"
                  placeholder="Acme Corp"
                  {...register("company_name", { onChange: (e) => setCompanySlug(slugFromName(e.target.value)) })}
                />
                {errors.company_name && <p className="text-xs text-destructive">{errors.company_name.message}</p>}
                {companySlug && <p className="text-xs text-muted-foreground">Workspace slug: {companySlug}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="full_name">Your name</Label>
                <Input id="full_name" placeholder="Jane Founder" {...register("full_name")} />
                {errors.full_name && <p className="text-xs text-destructive">{errors.full_name.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="email">Work email</Label>
                <Input id="email" type="email" placeholder="you@company.com" {...register("email")} />
                {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" placeholder="At least 8 characters, 1 uppercase, 1 digit" {...register("password")} />
                {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create workspace
            </Button>
          </form>
          <p className="text-center text-sm text-muted-foreground mt-4">
            Joining an existing company? Use the invitation link from your admin. Already have an account?{" "}
            <Link href="/login" className="text-primary hover:underline font-medium">Sign in</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
