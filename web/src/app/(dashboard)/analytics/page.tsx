"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";
import { AnalyticsSummary } from "@/types";

const COLORS = ["#6366f1", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#84cc16"];

const PERIODS = [7, 14, 30, 90];

export default function AnalyticsPage() {
  const [days, setDays] = useState(30);

  const { data, isLoading } = useQuery<AnalyticsSummary>({
    queryKey: ["analytics-summary", days],
    queryFn: () => api.get(`/api/v1/analytics/summary?days=${days}`).then((r) => r.data),
  });

  const events = data?.events ?? [];
  const total = events.reduce((a, e) => a + e.count, 0);

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex items-center gap-2">
        {PERIODS.map((p) => (
          <Button key={p} size="sm" variant={days === p ? "default" : "outline"} onClick={() => setDays(p)}>
            {p}d
          </Button>
        ))}
        <span className="ml-2 text-sm text-muted-foreground">{total} total events</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bar chart */}
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Events by Type</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-64" /> : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={events.slice(0, 10)} margin={{ top: 4, right: 8, left: -20, bottom: 40 }}>
                  <XAxis dataKey="type" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => [v, "Events"]} labelFormatter={(l) => l.replace(".", " › ")} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {events.slice(0, 10).map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Pie chart */}
        <Card>
          <CardHeader><CardTitle className="text-base">Distribution</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-52" /> : (
              <ResponsiveContainer width="100%" height={210}>
                <PieChart>
                  <Pie data={events} dataKey="count" nameKey="type" cx="50%" cy="50%" outerRadius={80} label={({ percent }: { percent?: number }) => `${((percent || 0) * 100).toFixed(0)}%`}>
                    {events.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v, n) => [v, String(n).replace(".", " › ")]} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Breakdown table */}
        <Card>
          <CardHeader><CardTitle className="text-base">Full Breakdown</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
            ) : events.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No data for this period</p>
            ) : (
              <div className="space-y-2">
                {events.map((e, i) => (
                  <div key={e.type} className="flex items-center gap-3 text-sm">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                    <span className="flex-1 text-muted-foreground capitalize">{e.type.replace(".", " › ")}</span>
                    <Badge variant="secondary">{e.count}</Badge>
                    <span className="text-xs text-muted-foreground w-10 text-right">{total ? ((e.count / total) * 100).toFixed(1) : 0}%</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
