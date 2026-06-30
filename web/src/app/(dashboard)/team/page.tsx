"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  UserPlus, Users, Loader2, Crown, Shield, User, Eye,
  Clock, CheckCircle2, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import api from "@/lib/api";
import { Membership, Invitation } from "@/types";
import { useAuthStore } from "@/store/auth-store";

const ROLE_ICONS: Record<string, React.ElementType> = {
  owner: Crown, admin: Shield, member: User, viewer: Eye,
};
const ROLE_COLOR: Record<string, string> = {
  owner: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20",
  admin: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-500/10 dark:text-purple-400 dark:border-purple-500/20",
  member: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20",
  viewer: "bg-muted text-muted-foreground border-border",
};

const inviteSchema = z.object({
  email: z.string().email("Invalid email"),
  role: z.enum(["admin", "member", "viewer"]),
});
type InviteForm = z.infer<typeof inviteSchema>;

export default function TeamPage() {
  const qc = useQueryClient();
  const org = useAuthStore((s) => s.org);

  const [inviteOpen, setInviteOpen] = useState(false);
  // Active member removal dialog
  const [removeTarget, setRemoveTarget] = useState<Membership | null>(null);
  const [removeReason, setRemoveReason] = useState("");

  const { data: myMembership } = useQuery<Membership>({
    queryKey: ["my-membership", org?.id],
    queryFn: () => api.get(`/api/v1/orgs/${org?.id}/members/me`).then((r) => r.data),
    enabled: !!org,
  });
  const isOwner = myMembership?.role === "owner";
  const canManageTeam = myMembership?.role === "owner" || myMembership?.role === "admin";

  const { data: members = [], isLoading: membersLoading } = useQuery<Membership[]>({
    queryKey: ["members", org?.id],
    queryFn: () => api.get(`/api/v1/orgs/${org?.id}/members`).then((r) => r.data),
    enabled: !!org && canManageTeam,
  });

  const { data: invitations = [], isLoading: invitationsLoading } = useQuery<Invitation[]>({
    queryKey: ["invitations", org?.id],
    queryFn: () => api.get(`/api/v1/orgs/${org?.id}/invitations`).then((r) => r.data),
    enabled: !!org && canManageTeam,
  });

  const isLoading = membersLoading || invitationsLoading;

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<InviteForm>({
    resolver: zodResolver(inviteSchema), defaultValues: { role: "member" },
  });

  const invite = useMutation({
    mutationFn: (data: InviteForm) =>
      api.post(`/api/v1/orgs/${org?.id}/invitations`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["members", org?.id] });
      qc.invalidateQueries({ queryKey: ["invitations", org?.id] });
      toast.success("Invitation sent");
      reset();
      setInviteOpen(false);
    },
    onError: () => toast.error("Failed to send invitation"),
  });

  // Cancel a pending invitation — no email, no prompt
  const cancelInvitation = useMutation({
    mutationFn: (invId: string) =>
      api.delete(`/api/v1/orgs/${org?.id}/invitations/${invId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invitations", org?.id] });
      toast.success("Invitation cancelled");
    },
    onError: () => toast.error("Failed to cancel invitation"),
  });

  // Remove an active member — requires reason, sends email
  const removeMember = useMutation({
    mutationFn: ({ userId, reason }: { userId: string; reason: string }) =>
      api.delete(`/api/v1/orgs/${org?.id}/members/${userId}`, { data: { reason } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["members", org?.id] });
      setRemoveTarget(null);
      setRemoveReason("");
      toast.success("Member removed and notified by email");
    },
    onError: () => toast.error("Failed to remove member"),
  });

  if (myMembership && !canManageTeam) {
    return (
      <Card className="max-w-xl">
        <CardContent className="pt-6 text-sm text-muted-foreground">
          Owners and admins can view all members and send invitations.
        </CardContent>
      </Card>
    );
  }

  const totalCount = members.length + invitations.length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{members.length} active</span>
          {invitations.length > 0 && (
            <>
              <span className="text-border">·</span>
              <span>{invitations.length} pending</span>
            </>
          )}
        </div>
        <Button size="sm" className="gap-2" onClick={() => setInviteOpen(true)}>
          <UserPlus className="h-4 w-4" />
          Invite Member
        </Button>
      </div>

      {/* Invite dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Invite team member</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit((d) => invite.mutate(d))} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Email address</Label>
              <Input type="email" placeholder="colleague@example.com" {...register("email")} />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select defaultValue="member" onValueChange={(v) => setValue("role", v as InviteForm["role"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin — full access except billing</SelectItem>
                  <SelectItem value="member">Member — standard access</SelectItem>
                  <SelectItem value="viewer">Viewer — read only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-full" disabled={invite.isPending}>
              {invite.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send Invitation
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Remove active member dialog — owner only, sends email with reason */}
      <Dialog open={!!removeTarget} onOpenChange={(o) => { if (!o) { setRemoveTarget(null); setRemoveReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove member</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              You are about to remove{" "}
              <span className="font-medium text-foreground">{removeTarget?.user_email}</span>{" "}
              from the organization. They will receive an email explaining why.
            </p>
            <div className="space-y-1.5">
              <Label>Reason for removal <span className="text-destructive">*</span></Label>
              <Textarea
                placeholder="e.g. No longer part of the team, project completed..."
                rows={3}
                value={removeReason}
                onChange={(e) => setRemoveReason(e.target.value)}
                className="resize-none"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setRemoveTarget(null); setRemoveReason(""); }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!removeReason.trim() || removeMember.isPending}
              onClick={() => removeTarget && removeMember.mutate({ userId: removeTarget.user_id, reason: removeReason.trim() })}
            >
              {removeMember.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Remove & Notify
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Table */}
      <Card className="shadow-sm border-border/50">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : totalCount === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
              <Users className="h-10 w-10 opacity-30" />
              <p className="text-sm">No members yet. Invite your team!</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60">
                  <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider w-full">Member</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">Role</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">Status</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">Joined</th>
                  {isOwner && <th className="px-4 py-3 w-10" />}
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const RoleIcon = ROLE_ICONS[m.role] ?? User;
                  const isThisOwner = m.role === "owner";
                  return (
                    <tr key={m.id} className="border-b border-border/40 last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8 shrink-0">
                            <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                              {(m.user_email ?? "U")[0].toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium text-foreground">{m.user_email ?? m.user_id}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <Badge variant="outline" className={`gap-1.5 text-xs ${ROLE_COLOR[m.role]}`}>
                          <RoleIcon className="h-3 w-3" />{m.role}
                        </Badge>
                      </td>
                      <td className="px-4 py-3.5">
                        <Badge variant="outline" className="gap-1.5 text-xs bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20">
                          <CheckCircle2 className="h-3 w-3" />Active
                        </Badge>
                      </td>
                      <td className="px-6 py-3.5 text-xs text-muted-foreground whitespace-nowrap">
                        {m.joined_at ? new Date(m.joined_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                      </td>
                      {isOwner && (
                        <td className="px-4 py-3.5">
                          {!isThisOwner && (
                            <button
                              onClick={() => setRemoveTarget(m)}
                              className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                              title="Remove member"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
                {invitations.map((inv) => {
                  const RoleIcon = ROLE_ICONS[inv.role] ?? User;
                  return (
                    <tr key={inv.id} className="border-b border-border/40 last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8 shrink-0">
                            <AvatarFallback className="bg-muted text-muted-foreground text-xs font-semibold">
                              {inv.email[0].toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium text-muted-foreground">{inv.email}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <Badge variant="outline" className={`gap-1.5 text-xs ${ROLE_COLOR[inv.role] ?? ROLE_COLOR.member}`}>
                          <RoleIcon className="h-3 w-3" />{inv.role}
                        </Badge>
                      </td>
                      <td className="px-4 py-3.5">
                        <Badge variant="outline" className="gap-1.5 text-xs bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20">
                          <Clock className="h-3 w-3" />Invited
                        </Badge>
                      </td>
                      <td className="px-6 py-3.5 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(inv.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </td>
                      {isOwner && (
                        <td className="px-4 py-3.5">
                          <button
                            onClick={() => cancelInvitation.mutate(inv.id)}
                            disabled={cancelInvitation.isPending}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                            title="Cancel invitation"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
