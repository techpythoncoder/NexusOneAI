"use client";

import { useQuery, useQueries } from "@tanstack/react-query";
import { FolderKanban, CheckSquare, Bot, Users, TrendingUp, Activity } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import api from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";
import { AnalyticsSummary, Membership, Project, Task } from "@/types";

function StatCard({ title, value, icon: Icon, delta }: { title: string; value: string | number; icon: React.ElementType; delta?: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {delta && <p className="text-xs text-emerald-500 mt-1 flex items-center gap-1"><TrendingUp className="h-3 w-3" />{delta}</p>}
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { org, user } = useAuthStore();

  const { data: membership } = useQuery<Membership>({
    queryKey: ["my-membership", org?.id],
    queryFn: () => api.get(`/api/v1/orgs/${org?.id}/members/me`).then((r) => r.data),
    enabled: !!org,
  });

  const isAdmin = membership?.role === "owner" || membership?.role === "admin";

  const { data: analytics, isLoading: analyticsLoading } = useQuery<AnalyticsSummary>({
    queryKey: ["analytics-summary", org?.id, user?.id, isAdmin],
    queryFn: () => {
      const url = isAdmin
        ? "/api/v1/analytics/summary?days=30"
        : `/api/v1/analytics/summary?days=30&user_id=${user?.id}`;
      return api.get(url).then((r) => r.data);
    },
    enabled: !!org && !!user && membership !== undefined,
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: () => api.get("/api/v1/projects").then((r) => r.data),
    enabled: !!org,
  });

  // Query tasks for all projects in parallel
  const tasksQueries = useQueries({
    queries: projects.map((p) => ({
      queryKey: ["tasks", p.id],
      queryFn: () => api.get(`/api/v1/projects/${p.id}/tasks/`).then((r) => r.data),
      enabled: !!p.id,
    })),
  });

  const allTasks: Task[] = tasksQueries.flatMap((q) => (q.data as Task[]) || []);
  const myTasks = allTasks.filter((t) => t.assignee_id === user?.id);
  const myPendingTasks = myTasks.filter((t) => t.status.toLowerCase() !== "done" && t.status.toLowerCase() !== "cancelled");

  const totalEvents = analytics?.events?.reduce((a, e) => a + e.count, 0) ?? 0;
  const isLoading = analyticsLoading || membership === undefined;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className={`grid grid-cols-2 gap-4 ${isAdmin ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
        {isLoading ? (
          Array.from({ length: isAdmin ? 4 : 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
        ) : (
          <>
            <StatCard title="Projects" value={projects?.length ?? 0} icon={FolderKanban} delta="+2 this month" />
            <StatCard title="Events (30d)" value={totalEvents} icon={Activity} />
            <StatCard title="AI Queries" value={analytics?.events?.find((e) => e.type?.includes("ai"))?.count ?? 0} icon={Bot} />
            {isAdmin && <StatCard title="Team Members" value="—" icon={Users} />}
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Column */}
        <div className="lg:col-span-2 space-y-6">
          {/* My Tasks Card */}
          <Card className="w-full">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <CheckSquare className="h-4 w-4 text-primary" />
                <span>My Assigned Tasks ({myPendingTasks.length})</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading || tasksQueries.some((q) => q.isLoading) ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : myTasks.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No tasks assigned to you yet.</p>
              ) : (
                <div className="border border-border rounded-lg overflow-hidden divide-y divide-border">
                  {myTasks.slice(0, 10).map((t) => {
                    const projName = projects.find((p) => p.id === t.project_id)?.name || "Project";
                    return (
                      <div key={t.id} className="flex items-center justify-between p-3 text-sm hover:bg-muted/50 transition-colors">
                        <div className="min-w-0 pr-4 space-y-1">
                          <Link href={`/projects/${t.project_id}`} className="font-medium hover:underline flex items-center gap-1.5 text-foreground">
                            <span>{projName}</span>
                            <span className="text-muted-foreground font-normal">#{t.task_number}</span>
                          </Link>
                          <p className="text-xs text-muted-foreground truncate">{t.title}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="outline" className="text-xs capitalize">{t.priority.toLowerCase()}</Badge>
                          <Badge variant="secondary" className="text-xs uppercase">{t.status.replace("_", " ")}</Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Event Breakdown (Admin Only) */}
          {isAdmin && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Event Breakdown (30 days)</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
                ) : analytics?.events?.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">No events yet. Start using the platform!</p>
                ) : (
                  <div className="space-y-2">
                    {analytics?.events?.slice(0, 8).map((e) => (
                      <div key={e.type} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground capitalize">{e.type.replace(".", " › ")}</span>
                        <Badge variant="secondary">{e.count}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar Column */}
        <div className="space-y-6">
          <Card className="w-full">
            <CardHeader>
              <CardTitle className="text-base">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              {[
                { label: "New Project", href: "/projects", icon: FolderKanban },
                { label: "AI Chat", href: "/ai", icon: Bot },
                { label: "Knowledge Base", href: "/knowledge", icon: CheckSquare },
                { label: "Team Chat", href: "/chat", icon: Users },
              ].map(({ label, href, icon: Icon }) => (
                <a key={href} href={href} className="flex flex-col items-center gap-2 p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors text-center">
                  <Icon className="h-5 w-5 text-primary" />
                  <span className="text-sm font-medium">{label}</span>
                </a>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
