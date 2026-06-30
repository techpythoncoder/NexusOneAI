"use client";

import { usePathname, useRouter } from "next/navigation";
import { Search, Sun, Moon, Folder, CheckSquare, BookOpen, Loader2, Users, MessageSquare, Bell } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useEffect, useRef } from "react";
import api from "@/lib/api";

const TITLES: Record<string, string> = {
  "/":              "Dashboard",
  "/projects":      "Projects",
  "/ai":            "AI Assistant",
  "/knowledge":     "Knowledge Base",
  "/chat":          "Team Chat",
  "/analytics":     "Analytics",
  "/team":          "Team",
  "/notifications": "Notifications",
  "/settings":      "Settings",
  "/admin/team":     "Team Management",
  "/admin/analytics": "Org Analytics",
  "/admin/billing":  "Billing",
  "/admin":          "Admin",
};

interface SearchResultItem {
  id: string;
  type: "projects" | "tasks" | "documents" | "members" | "comments" | "notifications";
  source: {
    title?: string;
    name?: string;
    description?: string;
    content?: string;
    project_id?: string;
    task_id?: string;
    email?: string;
    role?: string;
    author_email?: string;
    // notification fields
    body?: string;
    notification_type?: string;
    is_read?: boolean;
    action_url?: string;
    created_at?: string;
  };
}

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const title = Object.entries(TITLES).find(([k]) => k === "/" ? pathname === "/" : pathname.startsWith(k))?.[1] ?? "NexusOne AI";

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Debounce the search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  // Fetch results when debounced query changes
  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }

    let active = true;
    async function performSearch() {
      setLoading(true);
      try {
        const response = await api.get(`/api/v1/search?q=${encodeURIComponent(debouncedQuery)}`);
        if (active) {
          setResults(response.data.results || []);
        }
      } catch (err) {
        console.error("Global search failed", err);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    performSearch();
    return () => {
      active = false;
    };
  }, [debouncedQuery]);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleResultClick = (item: SearchResultItem) => {
    setIsOpen(false);
    setQuery("");
    if (item.type === "projects") {
      router.push(`/projects/${item.id}`);
    } else if (item.type === "tasks") {
      router.push(`/projects/${item.source.project_id}?task=${item.id}`);
    } else if (item.type === "documents") {
      router.push(`/knowledge/${item.id}`);
    } else if (item.type === "members") {
      router.push(`/team`);
    } else if (item.type === "comments") {
      router.push(`/projects/${item.source.project_id}?task=${item.source.task_id}`);
    }
  };

  // Group results by type
  const projects = results.filter((r) => r.type === "projects");
  const tasks = results.filter((r) => r.type === "tasks");
  const documents = results.filter((r) => r.type === "documents");
  const members = results.filter((r) => r.type === "members");
  const comments = results.filter((r) => r.type === "comments");
  const notifications = results.filter((r) => r.type === "notifications");

  return (
    <header className="flex items-center gap-4 px-6 h-14 border-b border-border bg-card/50 backdrop-blur shrink-0 relative z-50">
      <h1 className="font-semibold text-lg">{title}</h1>
      
      <div ref={searchRef} className="flex-1 max-w-md ml-4 hidden md:block relative">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input 
            placeholder="Search projects, tasks, people, docs..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            className="pl-9 pr-8 h-8 bg-muted/40 border border-input/40 focus:border-ring focus:bg-background transition-all text-sm" 
          />
          {loading && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>

        {/* Search Results Dropdown */}
        {isOpen && query.trim() !== "" && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-popover border border-border rounded-xl shadow-lg max-h-[380px] overflow-y-auto z-50 p-2 backdrop-blur-xl bg-popover/95">
            {loading && results.length === 0 ? (
              <div className="flex items-center justify-center py-6 text-sm text-muted-foreground gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Searching...
              </div>
            ) : results.length === 0 ? (
              <div className="text-center py-6 text-sm text-muted-foreground">
                No results found for "{query}"
              </div>
            ) : (
              <div className="space-y-4">
                {/* Projects */}
                {projects.length > 0 && (
                  <div>
                    <div className="text-[10px] font-bold text-muted-foreground uppercase px-2 py-1 tracking-wider">
                      Projects
                    </div>
                    <div className="space-y-0.5">
                      {projects.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => handleResultClick(p)}
                          className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-accent hover:text-accent-foreground flex items-center gap-2.5 transition-all text-sm"
                        >
                          <Folder className="h-4 w-4 text-amber-500 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="font-medium truncate">{p.source.name}</p>
                            {p.source.description && (
                              <p className="text-[11px] text-muted-foreground truncate">{p.source.description}</p>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tasks */}
                {tasks.length > 0 && (
                  <div>
                    <div className="text-[10px] font-bold text-muted-foreground uppercase px-2 py-1 tracking-wider">
                      Tasks
                    </div>
                    <div className="space-y-0.5">
                      {tasks.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => handleResultClick(t)}
                          className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-accent hover:text-accent-foreground flex items-center gap-2.5 transition-all text-sm"
                        >
                          <CheckSquare className="h-4 w-4 text-purple-500 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="font-medium truncate">{t.source.title}</p>
                            {t.source.description && (
                              <p className="text-[11px] text-muted-foreground truncate">{t.source.description}</p>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Wiki / Documents */}
                {documents.length > 0 && (
                  <div>
                    <div className="text-[10px] font-bold text-muted-foreground uppercase px-2 py-1 tracking-wider">
                      Documents
                    </div>
                    <div className="space-y-0.5">
                      {documents.map((d) => (
                        <button
                          key={d.id}
                          onClick={() => handleResultClick(d)}
                          className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-accent hover:text-accent-foreground flex items-center gap-2.5 transition-all text-sm"
                        >
                          <BookOpen className="h-4 w-4 text-blue-500 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="font-medium truncate">{d.source.title}</p>
                            {d.source.content && (
                              <p className="text-[11px] text-muted-foreground truncate">{d.source.content}</p>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Members */}
                {members.length > 0 && (
                  <div>
                    <div className="text-[10px] font-bold text-muted-foreground uppercase px-2 py-1 tracking-wider">
                      People
                    </div>
                    <div className="space-y-0.5">
                      {members.map((m) => (
                        <button
                          key={m.id}
                          onClick={() => handleResultClick(m)}
                          className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-accent hover:text-accent-foreground flex items-center gap-2.5 transition-all text-sm"
                        >
                          <Users className="h-4 w-4 text-green-500 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="font-medium truncate">{m.source.name || m.source.email}</p>
                            <p className="text-[11px] text-muted-foreground truncate">
                              {m.source.name ? m.source.email : ""}{m.source.role ? ` · ${m.source.role}` : ""}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Comments */}
                {comments.length > 0 && (
                  <div>
                    <div className="text-[10px] font-bold text-muted-foreground uppercase px-2 py-1 tracking-wider">
                      Comments
                    </div>
                    <div className="space-y-0.5">
                      {comments.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => handleResultClick(c)}
                          className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-accent hover:text-accent-foreground flex items-center gap-2.5 transition-all text-sm"
                        >
                          <MessageSquare className="h-4 w-4 text-orange-500 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="font-medium truncate">{c.source.content}</p>
                            {c.source.author_email && (
                              <p className="text-[11px] text-muted-foreground truncate">by {c.source.author_email}</p>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Notifications */}
                {notifications.length > 0 && (
                  <div>
                    <div className="text-[10px] font-bold text-muted-foreground uppercase px-2 py-1 tracking-wider">
                      Notifications
                    </div>
                    <div className="space-y-0.5">
                      {notifications.slice(0, 8).map((n) => (
                        <button
                          key={n.id}
                          onClick={() => { router.push(n.source.action_url || "/notifications"); setIsOpen(false); setQuery(""); }}
                          className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-accent hover:text-accent-foreground flex items-center gap-2.5 transition-all text-sm"
                        >
                          <Bell className={`h-4 w-4 shrink-0 ${n.source.is_read ? "text-muted-foreground" : "text-blue-500"}`} />
                          <div className="min-w-0 flex-1">
                            <p className={`truncate ${n.source.is_read ? "font-normal" : "font-medium"}`}>{n.source.title}</p>
                            {n.source.body && (
                              <p className="text-[11px] text-muted-foreground truncate">{n.source.body}</p>
                            )}
                          </div>
                          {!n.source.is_read && (
                            <span className="h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
                          )}
                        </button>
                      ))}
                      {notifications.length > 8 && (
                        <button
                          onClick={() => { router.push("/notifications"); setIsOpen(false); setQuery(""); }}
                          className="w-full text-center px-2 py-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                        >
                          View all {notifications.length} notifications →
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </Button>
      </div>
    </header>
  );
}
