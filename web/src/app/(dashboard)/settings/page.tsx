"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  User, Key, Shield, Copy, Eye, EyeOff, Trash2, Plus, Loader2, Check,
  ShieldCheck, ShieldOff, QrCode,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import api from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";

// ── Schemas ─────────────────────────────────────────────────────────────────

const profileSchema = z.object({
  full_name: z.string().min(2, "Name must be at least 2 characters"),
});

const passwordSchema = z.object({
  current_password: z.string().min(1, "Required"),
  new_password: z.string().min(8, "At least 8 characters"),
  confirm_password: z.string(),
}).refine((d) => d.new_password === d.confirm_password, {
  message: "Passwords do not match",
  path: ["confirm_password"],
});

const apiKeySchema = z.object({
  name: z.string().min(2, "Key name required"),
});

const totpSchema = z.object({
  totp_code: z.string().length(6, "Must be exactly 6 digits").regex(/^\d+$/, "Digits only"),
});

type ProfileForm = z.infer<typeof profileSchema>;
type PasswordForm = z.infer<typeof passwordSchema>;
type APIKeyForm = z.infer<typeof apiKeySchema>;
type TOTPForm = z.infer<typeof totpSchema>;

// ── Types ────────────────────────────────────────────────────────────────────

interface APIKey {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  is_active: boolean;
  created_at: string;
  expires_at: string | null;
}

interface MFASetup {
  secret: string;
  qr_code_uri: string;
}

// ── Profile Tab ───────────────────────────────────────────────────────────────

function ProfileTab() {
  const { user, setAuth, token } = useAuthStore();
  const [avatarPreview, setAvatarPreview] = useState<string | null>(user?.avatar_url ?? null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  const { register, handleSubmit, formState: { errors, isDirty } } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: { full_name: user?.full_name ?? "" },
  });

  const uploadAvatar = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return api.post("/api/v1/users/me/avatar", form, {
        headers: { "Content-Type": "multipart/form-data" },
      }).then((r) => r.data);
    },
    onSuccess: (updated) => {
      if (token) setAuth(token, updated);
      setAvatarFile(null);
      toast.success("Avatar updated");
    },
    onError: () => toast.error("Failed to upload avatar"),
  });

  const update = useMutation({
    mutationFn: (data: ProfileForm) =>
      api.patch("/api/v1/users/me", { full_name: data.full_name }).then((r) => r.data),
    onSuccess: (updated) => {
      if (token) setAuth(token, updated);
      toast.success("Profile updated");
    },
    onError: () => toast.error("Failed to update profile"),
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Image must be under 5 MB"); return; }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const initials = user?.full_name
    ?.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) ?? "U";

  return (
    <div className="space-y-6 max-w-lg">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Personal information</CardTitle>
          <CardDescription>Update your name and profile photo.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Avatar upload */}
          <div className="flex items-center gap-5">
            <div className="relative group">
              <Avatar className="h-20 w-20">
                {avatarPreview && <AvatarImage src={avatarPreview} alt={user?.full_name ?? ""} />}
                <AvatarFallback className="text-2xl bg-primary/10 text-primary font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <label
                htmlFor="avatar-upload"
                className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              >
                <User className="h-5 w-5 text-white" />
              </label>
              <input
                id="avatar-upload"
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
            <div className="space-y-1">
              <p className="font-medium">{user?.full_name}</p>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
              {user?.is_verified && (
                <Badge variant="secondary" className="text-xs gap-1">
                  <Check className="h-3 w-3" /> Verified
                </Badge>
              )}
              {avatarFile ? (
                <div className="flex items-center gap-2 pt-1">
                  <p className="text-xs text-muted-foreground truncate max-w-[140px]">{avatarFile.name}</p>
                  <Button
                    size="sm" variant="default" className="h-6 text-xs px-2"
                    onClick={() => uploadAvatar.mutate(avatarFile)}
                    disabled={uploadAvatar.isPending}
                  >
                    {uploadAvatar.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Upload"}
                  </Button>
                  <Button
                    size="sm" variant="ghost" className="h-6 text-xs px-2"
                    onClick={() => { setAvatarFile(null); setAvatarPreview(user?.avatar_url ?? null); }}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <label htmlFor="avatar-upload" className="text-xs text-primary cursor-pointer hover:underline block pt-1">
                  Change photo
                </label>
              )}
            </div>
          </div>

          {/* Name / email form */}
          <form onSubmit={handleSubmit((d) => update.mutate(d))} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="full_name">Full name</Label>
              <Input id="full_name" {...register("full_name")} />
              {errors.full_name && <p className="text-xs text-destructive">{errors.full_name.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input value={user?.email ?? ""} disabled className="bg-muted/50" />
              <p className="text-xs text-muted-foreground">Email cannot be changed.</p>
            </div>
            <Button type="submit" disabled={!isDirty || update.isPending}>
              {update.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save changes
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// ── 2FA Setup Dialog ──────────────────────────────────────────────────────────

function TwoFASetupDialog({ open, onOpenChange, onEnabled }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onEnabled: () => void;
}) {
  const [step, setStep] = useState<"qr" | "verify">("qr");
  const [setup, setSetup] = useState<MFASetup | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<TOTPForm>({
    resolver: zodResolver(totpSchema),
  });

  const initSetup = useMutation({
    mutationFn: () => api.post("/api/v1/auth/mfa/setup").then((r) => r.data as MFASetup),
    onSuccess: (data) => { setSetup(data); setStep("qr"); },
    onError: () => toast.error("Failed to start 2FA setup"),
  });

  const verifySetup = useMutation({
    mutationFn: (data: TOTPForm) => api.post("/api/v1/auth/mfa/verify", data),
    onSuccess: () => {
      toast.success("Two-factor authentication enabled");
      onEnabled();
      onOpenChange(false);
      reset();
      setSetup(null);
      setStep("qr");
    },
    onError: () => toast.error("Invalid code — try again"),
  });

  // Trigger setup when dialog opens; reset when it closes
  useEffect(() => {
    if (open && !setup && !initSetup.isPending) {
      initSetup.mutate();
    }
    if (!open) {
      reset();
      setSetup(null);
      setStep("qr");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const copySecret = async () => {
    if (!setup?.secret) return;
    await navigator.clipboard.writeText(setup.secret);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  const qrSrc = setup
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(setup.qr_code_uri)}`
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Enable two-factor authentication
          </DialogTitle>
          <DialogDescription>
            Use an authenticator app like Google Authenticator, Authy, or 1Password.
          </DialogDescription>
        </DialogHeader>

        {initSetup.isPending && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {setup && step === "qr" && (
          <div className="space-y-4">
            <div className="flex justify-center">
              {qrSrc && (
                <img src={qrSrc} alt="2FA QR code" className="rounded-lg border border-border" width={200} height={200} />
              )}
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground text-center">
                Can&apos;t scan? Copy the secret key and enter it manually.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-muted rounded px-2 py-1.5 text-xs font-mono break-all">
                  {setup.secret}
                </code>
                <Button size="sm" variant="outline" onClick={copySecret} className="shrink-0">
                  {copiedSecret ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                </Button>
              </div>
            </div>
            <Button className="w-full" onClick={() => setStep("verify")}>
              I&apos;ve scanned the QR code
            </Button>
          </div>
        )}

        {setup && step === "verify" && (
          <form onSubmit={handleSubmit((d) => verifySetup.mutate(d))} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="totp_code">Enter the 6-digit code from your app</Label>
              <Input
                id="totp_code"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                className="text-center text-lg tracking-widest font-mono"
                {...register("totp_code")}
              />
              {errors.totp_code && <p className="text-xs text-destructive">{errors.totp_code.message}</p>}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setStep("qr")}>
                Back
              </Button>
              <Button type="submit" className="flex-1" disabled={verifySetup.isPending}>
                {verifySetup.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Verify &amp; enable
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── 2FA Disable Dialog ────────────────────────────────────────────────────────

function TwoFADisableDialog({ open, onOpenChange, onDisabled }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDisabled: () => void;
}) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm<TOTPForm>({
    resolver: zodResolver(totpSchema),
  });

  const disable = useMutation({
    mutationFn: (data: TOTPForm) => api.post("/api/v1/auth/mfa/disable", data),
    onSuccess: () => {
      toast.success("Two-factor authentication disabled");
      onDisabled();
      onOpenChange(false);
      reset();
    },
    onError: () => toast.error("Invalid code — 2FA not disabled"),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldOff className="h-5 w-5 text-destructive" />
            Disable two-factor authentication
          </DialogTitle>
          <DialogDescription>
            Enter the current code from your authenticator app to confirm.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit((d) => disable.mutate(d))} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="disable_totp">Authenticator code</Label>
            <Input
              id="disable_totp"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              className="text-center text-lg tracking-widest font-mono"
              {...register("totp_code")}
            />
            {errors.totp_code && <p className="text-xs text-destructive">{errors.totp_code.message}</p>}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" className="flex-1" disabled={disable.isPending}>
              {disable.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Disable 2FA
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Security Tab ──────────────────────────────────────────────────────────────

function SecurityTab() {
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [show2FASetup, setShow2FASetup] = useState(false);
  const [show2FADisable, setShow2FADisable] = useState(false);

  const { user, token, setAuth } = useAuthStore();

  const [mfaEnabled, setMfaEnabled] = useState(user?.mfa_enabled ?? false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
  });

  const changePassword = useMutation({
    mutationFn: async (data: PasswordForm) => {
      await api.post("/api/v1/auth/password-reset/confirm", {
        token: "current",
        new_password: data.new_password,
        current_password: data.current_password,
        email: user?.email,
      });
    },
    onSuccess: () => { toast.success("Password changed successfully"); reset(); },
    onError: () => toast.error("Failed to change password — check your current password"),
  });

  const refreshUser = async () => {
    try {
      const updated = await api.get("/api/v1/users/me").then((r) => r.data);
      if (token) setAuth(token, updated);
      setMfaEnabled(updated.mfa_enabled ?? false);
    } catch {
      // silently ignore
    }
  };

  return (
    <div className="space-y-6 max-w-lg">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Change password</CardTitle>
          <CardDescription>Choose a strong password with at least 8 characters.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit((d) => changePassword.mutate(d))} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="current_password">Current password</Label>
              <div className="relative">
                <Input
                  id="current_password"
                  type={showCurrent ? "text" : "password"}
                  {...register("current_password")}
                  className="pr-10"
                />
                <button type="button" onClick={() => setShowCurrent(!showCurrent)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.current_password && <p className="text-xs text-destructive">{errors.current_password.message}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="new_password">New password</Label>
              <div className="relative">
                <Input
                  id="new_password"
                  type={showNew ? "text" : "password"}
                  {...register("new_password")}
                  className="pr-10"
                />
                <button type="button" onClick={() => setShowNew(!showNew)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.new_password && <p className="text-xs text-destructive">{errors.new_password.message}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="confirm_password">Confirm new password</Label>
              <Input id="confirm_password" type="password" {...register("confirm_password")} />
              {errors.confirm_password && <p className="text-xs text-destructive">{errors.confirm_password.message}</p>}
            </div>
            <Button type="submit" disabled={changePassword.isPending}>
              {changePassword.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Update password
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <QrCode className="h-4 w-4" />
            Two-factor authentication
          </CardTitle>
          <CardDescription>
            Add a second layer of security using a time-based one-time password (TOTP) app.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {mfaEnabled ? (
                <>
                  <div className="h-8 w-8 rounded-full bg-green-500/10 flex items-center justify-center">
                    <ShieldCheck className="h-4 w-4 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">2FA is enabled</p>
                    <p className="text-xs text-muted-foreground">Your account is protected with an authenticator app.</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                    <ShieldOff className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">2FA is not enabled</p>
                    <p className="text-xs text-muted-foreground">Enable to protect your account with a second factor.</p>
                  </div>
                </>
              )}
            </div>
            {mfaEnabled ? (
              <Button variant="destructive" size="sm" onClick={() => setShow2FADisable(true)}>
                Disable
              </Button>
            ) : (
              <Button size="sm" onClick={() => setShow2FASetup(true)}>
                Enable
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <TwoFASetupDialog
        open={show2FASetup}
        onOpenChange={setShow2FASetup}
        onEnabled={refreshUser}
      />
      <TwoFADisableDialog
        open={show2FADisable}
        onOpenChange={setShow2FADisable}
        onDisabled={refreshUser}
      />
    </div>
  );
}

// ── API Keys Tab ──────────────────────────────────────────────────────────────

function APIKeysTab() {
  const { org } = useAuthStore();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: apiKeys = [], isLoading } = useQuery<APIKey[]>({
    queryKey: ["api-keys"],
    queryFn: () => api.get("/api/v1/users/me/api-keys").then((r) => r.data),
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<APIKeyForm>({
    resolver: zodResolver(apiKeySchema),
  });

  const createKey = useMutation({
    mutationFn: (data: APIKeyForm) =>
      api.post("/api/v1/users/me/api-keys", {
        name: data.name,
        organization_id: org?.id,
        scopes: ["read", "write"],
      }).then((r) => r.data),
    onSuccess: (data) => {
      setNewKey(data.key);
      qc.invalidateQueries({ queryKey: ["api-keys"] });
      reset();
    },
    onError: () => toast.error("Failed to create API key"),
  });

  const revokeKey = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/users/me/api-keys/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["api-keys"] }); toast.success("API key revoked"); },
    onError: () => toast.error("Failed to revoke key"),
  });

  const copyKey = async () => {
    if (!newKey) return;
    await navigator.clipboard.writeText(newKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {newKey && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-primary">Key created — copy it now</CardTitle>
            <CardDescription>This key will not be shown again.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-background border rounded px-3 py-2 text-sm font-mono break-all">
                {newKey}
              </code>
              <Button size="sm" variant="outline" onClick={copyKey} className="shrink-0 gap-1">
                {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setNewKey(null)}>Dismiss</Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">API Keys</CardTitle>
            <CardDescription>Use keys to authenticate with the NexusOne API.</CardDescription>
          </div>
          <Button size="sm" className="gap-1" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" /> New key
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          ) : apiKeys.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Key className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No API keys yet</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {apiKeys.map((k) => (
                <div key={k.id} className="flex items-center justify-between py-3 gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{k.name}</span>
                      {k.scopes.map((s) => (
                        <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                      ))}
                      {!k.is_active && <Badge variant="destructive" className="text-xs">Revoked</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 font-mono">{k.key_prefix}••••••••</p>
                  </div>
                  {k.is_active && (
                    <Button
                      size="sm" variant="ghost"
                      className="text-destructive hover:text-destructive shrink-0"
                      onClick={() => revokeKey.mutate(k.id)}
                      disabled={revokeKey.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showCreate} onOpenChange={(o) => { setShowCreate(o); reset(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create API key</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit((d) => { createKey.mutate(d); setShowCreate(false); })} className="space-y-4 pt-2">
            <div className="space-y-1">
              <Label htmlFor="key_name">Key name</Label>
              <Input id="key_name" placeholder="e.g. CI/CD pipeline" {...register("name")} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button type="submit" disabled={createKey.isPending}>
                {createKey.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your profile, security, and API access.</p>
      </div>
      <Separator />
      <Tabs defaultValue="profile">
        <TabsList className="mb-6">
          <TabsTrigger value="profile" className="gap-2">
            <User className="h-4 w-4" /> Profile
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-2">
            <Shield className="h-4 w-4" /> Security
          </TabsTrigger>
          <TabsTrigger value="api-keys" className="gap-2">
            <Key className="h-4 w-4" /> API Keys
          </TabsTrigger>
        </TabsList>
        <TabsContent value="profile"><ProfileTab /></TabsContent>
        <TabsContent value="security"><SecurityTab /></TabsContent>
        <TabsContent value="api-keys"><APIKeysTab /></TabsContent>
      </Tabs>
    </div>
  );
}
