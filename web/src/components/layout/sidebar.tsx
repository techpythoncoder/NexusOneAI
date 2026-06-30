"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Zap, LayoutDashboard, FolderKanban, Bot, BookOpen,
  MessageSquare, BarChart3, Users, Bell, LogOut, Settings, CreditCard, Code,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuthStore } from "@/store/auth-store";
import { useRouter } from "next/navigation";
import { ScrollArea } from "@/components/ui/scroll-area";
import { OrgSwitcher } from "@/components/org/org-switcher";
import api from "@/lib/api";
import type { Membership } from "@/types";

const MEMBER_NAV = [
  { href: "/",              label: "Dashboard",      icon: LayoutDashboard },
  { href: "/projects",      label: "Projects",       icon: FolderKanban },
  { href: "/ai",            label: "AI Assistant",   icon: Bot },
  { href: "/knowledge",     label: "Knowledge Base", icon: BookOpen },
  { href: "/chat",          label: "Team Chat",      icon: MessageSquare },
  { href: "/notifications", label: "Notifications",  icon: Bell },
];

const ADMIN_NAV = [
  { href: "/admin",         label: "Admin Overview", icon: LayoutDashboard },
  { href: "/admin/team",    label: "Team",           icon: Users },
  { href: "/admin/analytics", label: "Analytics",   icon: BarChart3 },
  { href: "/admin/billing", label: "Billing",        icon: CreditCard },
];

const WORKSPACE_NAV = [
  { href: "/",              label: "Dashboard",      icon: LayoutDashboard },
  { href: "/projects",      label: "Projects",       icon: FolderKanban },
  { href: "/ai",            label: "AI Assistant",   icon: Bot },
  { href: "/knowledge",     label: "Knowledge Base", icon: BookOpen },
  { href: "/chat",          label: "Team Chat",      icon: MessageSquare },
  { href: "/notifications", label: "Notifications",  icon: Bell },
];

export function Sidebar({ mode }: { mode?: "admin" | "member" }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, org } = useAuthStore();

  const { data: membership } = useQuery<Membership>({
    queryKey: ["my-membership", org?.id],
    queryFn: () => api.get(`/api/v1/orgs/${org?.id}/members/me`).then((r) => r.data),
    enabled: !!org,
  });

  const { data: notifCount } = useQuery<{ unread_count: number }>({
    queryKey: ["notifications-count"],
    queryFn: () => api.get("/api/v1/notifications/count").then((r) => r.data),
    enabled: !!user,
    refetchInterval: 5000,
  });

  const { data: chatUnread } = useQuery<{ unread_count: number }>({
    queryKey: ["chat-unread", org?.id],
    queryFn: () => api.get("/api/v1/chat/channels/unread-total").then((r) => r.data),
    enabled: !!org,
    refetchInterval: 15000,
  });

  const unreadCount = notifCount?.unread_count ?? 0;
  const chatUnreadCount = chatUnread?.unread_count ?? 0;
  const isAdmin = membership?.role === "owner" || membership?.role === "admin";
  const activeMode = mode ?? (pathname.startsWith("/admin") || isAdmin ? "admin" : "member");

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  const initials = user?.full_name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) ?? "U";

  return (
    <aside className="flex flex-col w-64 border-r border-border bg-card h-full relative">
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 py-3.5 border-b border-border">
        <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary">
          <Zap className="h-3.5 w-3.5 text-primary-foreground" />
        </div>
        <span className="font-bold text-base">NexusOne AI</span>
      </div>

      {/* Org switcher */}
      <div className="px-1 pt-2 pb-1 border-b border-border">
        <OrgSwitcher />
      </div>

      {/* Nav */}
      <ScrollArea className="flex-1 py-3">
        {activeMode === "admin" ? (
          <div className="px-2 space-y-4">
            <div>
              <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">Admin</p>
              <nav className="space-y-0.5">
                {ADMIN_NAV.map(({ href, label, icon: Icon }) => {
                  const active = href === "/admin" ? pathname === href : pathname.startsWith(href);
                  return (
                    <Link key={href} href={href}>
                      <div className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                        active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}>
                        <Icon className="h-4 w-4 shrink-0" />{label}
                      </div>
                    </Link>
                  );
                })}
              </nav>
            </div>
            <div>
              <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">Workspace</p>
              <nav className="space-y-0.5">
                {WORKSPACE_NAV.map(({ href, label, icon: Icon }) => {
                  const active = href === "/" ? pathname === href : pathname.startsWith(href);
                  return (
                    <Link key={href} href={href}>
                      <div className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                        active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}>
                        <Icon className="h-4 w-4 shrink-0" />{label}
                        {label === "Notifications" && unreadCount > 0 && (
                          <Badge variant="destructive" className="ml-auto h-5 px-1.5 text-xs">{unreadCount}</Badge>
                        )}
                        {label === "Team Chat" && chatUnreadCount > 0 && (
                          <Badge variant="destructive" className="ml-auto h-5 px-1.5 text-xs">{chatUnreadCount}</Badge>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </nav>
            </div>
          </div>
        ) : (
          <nav className="px-2 space-y-0.5">
            {MEMBER_NAV.map(({ href, label, icon: Icon }) => {
              const active = href === "/" ? pathname === href : pathname.startsWith(href);
              return (
                <Link key={href} href={href}>
                  <div className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                    active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}>
                    <Icon className="h-4 w-4 shrink-0" />{label}
                    {label === "Notifications" && unreadCount > 0 && (
                      <Badge variant="destructive" className="ml-auto h-5 px-1.5 text-xs">{unreadCount}</Badge>
                    )}
                    {label === "Team Chat" && chatUnreadCount > 0 && (
                      <Badge variant="destructive" className="ml-auto h-5 px-1.5 text-xs">{chatUnreadCount}</Badge>
                    )}
                  </div>
                </Link>
              );
            })}
          </nav>
        )}
      </ScrollArea>

      {/* User footer */}
      <div className="border-t border-border p-3 space-y-1">
        {membership?.role === "owner" && (
          <Link href="/developer">
            <div className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all",
              pathname === "/developer" ? "bg-muted text-foreground font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}>
              <Code className="h-4 w-4" />
              Developer Portal
            </div>
          </Link>
        )}
        <Link href="/settings">
          <div className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all",
            pathname === "/settings" ? "bg-muted text-foreground font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}>
            <Settings className="h-4 w-4" />
            Settings
          </div>
        </Link>
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg mt-1">
          <Avatar className="h-7 w-7">
            <AvatarFallback className="text-xs bg-primary text-primary-foreground">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user?.full_name ?? "User"}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={handleLogout}>
            <LogOut className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </aside>
  );
}
