"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  Activity, 
  BarChart3, 
  CreditCard, 
  Users,
  PlusCircle, 
  UserPlus, 
  UserCheck, 
  UserMinus, 
  FolderPlus, 
  CheckCircle2, 
  FilePlus2, 
  Sparkles,
  HelpCircle,
  MessageSquare
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import api from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";
import type { AnalyticsSummary, AnalyticsEvent, Membership } from "@/types";

function StatCard({ title, value, icon: Icon }: { title: string; value: string | number; icon: React.ElementType }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent><div className="text-2xl font-bold">{value}</div></CardContent>
    </Card>
  );
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.max(0, Math.floor(diffMs / 1000));
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return "yesterday";
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function getEventDetails(event: AnalyticsEvent) {
  const type = event.event_type;
  const props = event.properties || {};

  switch (type) {
    case "org.created":
      return {
        icon: PlusCircle,
        color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
        title: "Organization Created",
        description: `Workspace "${props.name || "Unknown"}" was created.`,
      };
    case "org.member.invited":
      return {
        icon: UserPlus,
        color: "text-blue-500 bg-blue-500/10 border-blue-500/20",
        title: "Member Invited",
        description: `Invited ${props.email || "a new user"} as ${props.role || "member"}.`,
      };
    case "org.member.joined":
      return {
        icon: UserCheck,
        color: "text-indigo-500 bg-indigo-500/10 border-indigo-500/20",
        title: "Member Joined",
        description: `${props.user_email || "A member"} accepted their invitation and joined.`,
      };
    case "org.member.removed":
      return {
        icon: UserMinus,
        color: "text-rose-500 bg-rose-500/10 border-rose-500/20",
        title: "Member Removed",
        description: `Removed ${props.user_email || "a member"} from the organization.`,
      };
    case "project.created":
      return {
        icon: FolderPlus,
        color: "text-amber-500 bg-amber-500/10 border-amber-500/20",
        title: "Project Created",
        description: `Created project "${props.name || "Unknown"}".`,
      };
    case "task.created":
      return {
        icon: FilePlus2,
        color: "text-purple-500 bg-purple-500/10 border-purple-500/20",
        title: "Task Created",
        description: `Created task "${props.title || "Untitled"}".`,
      };
    case "task.completed":
      return {
        icon: CheckCircle2,
        color: "text-teal-500 bg-teal-500/10 border-teal-500/20",
        title: "Task Completed",
        description: `Completed task "${props.task_title || props.title || "Untitled"}".`,
      };
    case "task.assigned":
      return {
        icon: Sparkles,
        color: "text-cyan-500 bg-cyan-500/10 border-cyan-500/20",
        title: "Task Assigned",
        description: `Assigned task "${props.task_title || props.title || "Untitled"}" to ${props.assignee_email || "a user"}.`,
      };
    case "comment.created":
      return {
        icon: MessageSquare,
        color: "text-blue-500 bg-blue-500/10 border-blue-500/20",
        title: "Comment Created",
        description: `${props.author_name || "Someone"} commented on task "${props.task_title || props.title || "Untitled"}": "${props.content || ""}"`,
      };
    case "ai.completion.streamed":
      return {
        icon: Sparkles,
        color: "text-indigo-500 bg-indigo-500/10 border-indigo-500/20",
        title: "AI Completion Streamed",
        description: `Generated AI response using ${props.model_used || "LLM"} (prompt: ${props.prompt_length || 0} chars, response: ${props.response_length || 0} chars).`,
      };
    default:
      return {
        icon: HelpCircle,
        color: "text-muted-foreground bg-muted border-border",
        title: type.split(".").map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(" "),
        description: JSON.stringify(props),
      };
  }
}

export default function AdminOverviewPage() {
  const org = useAuthStore((s) => s.org);
  const [mounted, setMounted] = useState(false);
  const [page, setPage] = useState(1);
  const limit = 5;

  useEffect(() => {
    setMounted(true);
  }, []);

  const { data: members = [], isLoading: membersLoading } = useQuery<Membership[]>({
    queryKey: ["admin-members", org?.id],
    queryFn: () => api.get(`/api/v1/orgs/${org?.id}/members`).then((r) => r.data),
    enabled: !!org,
  });

  const { data: analytics, isLoading: analyticsLoading } = useQuery<AnalyticsSummary>({
    queryKey: ["admin-analytics-summary", org?.id],
    queryFn: () => api.get("/api/v1/analytics/summary?days=30").then((r) => r.data),
    enabled: !!org,
  });

  const { data: events = [], isLoading: eventsLoading } = useQuery<AnalyticsEvent[]>({
    queryKey: ["admin-analytics-events", org?.id, page],
    queryFn: () => api.get(`/api/v1/analytics/events?days=30&limit=${limit}&skip=${(page - 1) * limit}`).then((r) => r.data),
    enabled: !!org,
  });

  const totalEvents = analytics?.events?.reduce((a, e) => a + e.count, 0) ?? 0;
  const loading = membersLoading || analyticsLoading;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{org?.name ?? "Workspace"} admin</h2>
          <p className="text-sm text-muted-foreground">Org-wide activity, member controls, analytics, and billing.</p>
        </div>
        <Badge variant="secondary">{org?.plan ?? "free"}</Badge>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
        ) : (
          <>
            <StatCard title="Members" value={members.length} icon={Users} />
            <StatCard title="Org Events (30d)" value={totalEvents} icon={Activity} />
            <StatCard title="Tracked Event Types" value={analytics?.events.length ?? 0} icon={BarChart3} />
            <StatCard title="Billing Plan" value={org?.plan ?? "free"} icon={CreditCard} />
          </>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Org Activity Feed</CardTitle>
        </CardHeader>
        <CardContent>
          {eventsLoading || !mounted ? (
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <div className="space-y-1 flex-1">
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : events.length ? (
            <div className="space-y-4">
              <div className="max-h-[480px] overflow-y-auto pr-2 scrollbar-thin">
                <div className="relative pl-6 border-l border-border/80 space-y-6 py-2 ml-3">
                  {events.map((event) => {
                    const details = getEventDetails(event);
                    const Icon = details.icon;
                    return (
                      <div key={event.id} className="relative group">
                        {/* Timeline dot/icon */}
                        <div className={`absolute -left-[36px] top-0.5 flex h-6 w-6 items-center justify-center rounded-full border bg-background ${details.color} shadow-sm transition-transform group-hover:scale-110`}>
                          <Icon className="h-3.5 w-3.5" />
                        </div>
                        
                        {/* Content */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-4">
                            <h4 className="text-sm font-semibold text-foreground">{details.title}</h4>
                            <span className="text-xs text-muted-foreground whitespace-nowrap" suppressHydrationWarning={true}>{formatRelativeTime(event.occurred_at)}</span>
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            {details.description}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Pagination controls */}
              <div className="flex items-center justify-between border-t border-border/60 pt-4">
                <p className="text-xs text-muted-foreground">
                  Page {page}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-background hover:bg-muted/50 disabled:opacity-50 disabled:pointer-events-none transition-colors"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage((p) => p + 1)}
                    disabled={events.length < limit}
                    className="px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-background hover:bg-muted/50 disabled:opacity-50 disabled:pointer-events-none transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground py-8 text-center">No org activity on this page.</p>
              {page > 1 && (
                <div className="flex justify-center">
                  <button
                    onClick={() => setPage(1)}
                    className="px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-background hover:bg-muted/50 transition-colors"
                  >
                    Go to Page 1
                  </button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
