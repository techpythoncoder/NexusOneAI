"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bell, CheckCheck, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { Notification } from "@/types";

interface PaginatedNotifications {
  items: Notification[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

const PAGE_SIZE_OPTIONS = [10, 20, 50];

export default function NotificationsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [unreadOnly, setUnreadOnly] = useState(false);

  const { data, isLoading } = useQuery<PaginatedNotifications>({
    queryKey: ["notifications", page, pageSize, unreadOnly],
    queryFn: () =>
      api
        .get("/api/v1/notifications", { params: { page, page_size: pageSize, unread_only: unreadOnly } })
        .then((r) => r.data),
    refetchInterval: 10000,
  });

  const notifications = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.total_pages ?? 1;
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  const markRead = useMutation({
    mutationFn: (id: string) =>
      api.post("/api/v1/notifications/read", { notification_ids: [id] }),
    onSuccess: invalidate,
  });

  const markAllRead = useMutation({
    mutationFn: () => api.post("/api/v1/notifications/read/all"),
    onSuccess: () => {
      invalidate();
      toast.success("All notifications marked as read");
    },
  });

  const handlePageSizeChange = (val: string | null) => {
    if (!val) return;
    setPageSize(Number(val));
    setPage(1);
  };

  const handleUnreadToggle = () => {
    setUnreadOnly((v) => !v);
    setPage(1);
  };

  return (
    <div className="space-y-4 max-w-3xl">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {total} notification{total !== 1 ? "s" : ""}
          </span>
          {unreadCount > 0 && (
            <Badge variant="destructive">{unreadCount} unread on this page</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={unreadOnly ? "default" : "outline"}
            size="sm"
            onClick={handleUnreadToggle}
          >
            {unreadOnly ? "Showing unread" : "Show unread only"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => markAllRead.mutate()}
            disabled={markAllRead.isPending || total === 0}
          >
            {markAllRead.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCheck className="h-3.5 w-3.5" />
            )}
            Mark all read
          </Button>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: pageSize > 10 ? 5 : 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center text-muted-foreground">
          <Bell className="h-12 w-12 opacity-40" />
          <div>
            <p className="font-medium text-foreground">All caught up!</p>
            <p className="text-sm">
              {unreadOnly ? "No unread notifications" : "No notifications yet"}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <Card
              key={n.id}
              className={cn(
                "transition-all cursor-pointer hover:border-primary/40",
                !n.is_read && "border-primary/30 bg-primary/5"
              )}
              onClick={() => {
                if (!n.is_read) markRead.mutate(n.id);
                if (n.action_url) router.push(n.action_url);
              }}
            >
              <CardContent className="flex items-start gap-4 p-4">
                <div
                  className={cn(
                    "w-2 h-2 rounded-full mt-1.5 shrink-0",
                    n.is_read ? "bg-muted-foreground/30" : "bg-primary"
                  )}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={cn("text-sm font-medium", !n.is_read && "text-foreground")}>
                      {n.title}
                    </p>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {new Date(n.created_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                  <Badge variant="secondary" className="mt-2 text-xs capitalize">
                    {n.notification_type.replace(/_/g, " ")}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination footer */}
      {totalPages > 0 && (
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Rows per page</span>
            <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
              <SelectTrigger className="h-8 w-16 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)} className="text-xs">
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setPage((p) => p - 1)}
                disabled={!data?.has_prev || isLoading}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setPage((p) => p + 1)}
                disabled={!data?.has_next || isLoading}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
