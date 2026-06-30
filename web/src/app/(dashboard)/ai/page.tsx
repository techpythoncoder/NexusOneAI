"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Send, Plus, Bot, User, Loader2, Sparkles, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import api from "@/lib/api";
import { AIConversation, AIMessage } from "@/types";
import { useAuthStore } from "@/store/auth-store";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";

export default function AIChatPage() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { org, user } = useAuthStore();

  const { data: conversations = [], isLoading: convsLoading } = useQuery<AIConversation[]>({
    queryKey: ["ai-conversations"],
    queryFn: () => api.get("/api/v1/ai/conversations").then((r) => r.data),
  });

  const { data: conversation } = useQuery<AIConversation>({
    queryKey: ["ai-conversation", selectedId],
    queryFn: () => api.get(`/api/v1/ai/conversations/${selectedId}`).then((r) => r.data),
    enabled: !!selectedId,
  });

  useEffect(() => {
    if (conversation?.messages) queueMicrotask(() => setMessages(conversation.messages ?? []));
  }, [conversation]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const newConv = useMutation({
    mutationFn: () => api.post("/api/v1/ai/conversations", {
      title: "New chat",
      context: {
        user_name: user?.full_name,
        user_email: user?.email,
      }
    }).then((r) => r.data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["ai-conversations"] });
      setSelectedId(data.id);
      setMessages([]);
    },
  });

  const updateTitle = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      api.patch(`/api/v1/ai/conversations/${id}`, { title }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-conversations"] });
      setEditingId(null);
    },
    onError: () => toast.error("Failed to update title"),
  });

  const deleteConv = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/ai/conversations/${id}`),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["ai-conversations"] });
      if (selectedId === id) {
        setSelectedId(null);
        setMessages([]);
      }
      toast.success("Chat deleted");
    },
    onError: () => toast.error("Failed to delete chat"),
  });

  const startEditing = (id: string, currentTitle: string) => {
    setEditingId(id);
    setEditTitle(currentTitle);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, id: string) => {
    if (e.key === "Enter") {
      if (editTitle.trim()) {
        updateTitle.mutate({ id, title: editTitle.trim() });
      } else {
        setEditingId(null);
      }
    } else if (e.key === "Escape") {
      setEditingId(null);
    }
  };

  const send = async () => {
    if (!input.trim() || streaming) return;
    if (!selectedId) { toast.error("Start a new conversation first"); return; }

    const userMsg: AIMessage = { role: "user", content: input };
    setMessages((prev) => [...prev, userMsg]);
    const prompt = input;
    setInput("");
    setStreaming(true);

    let assistantContent = "";
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/ai/completions/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("nexus_token")}`,
        },
        body: JSON.stringify({ prompt, conversation_id: selectedId }),
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("No stream");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));
        for (const line of lines) {
          const data = line.slice(6);
          if (data === "[DONE]") break;
          if (data.startsWith("{")) {
            try { assistantContent += JSON.parse(data).choices?.[0]?.delta?.content ?? ""; } catch { /* skip */ }
          } else {
            assistantContent += data;
          }
        }
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: assistantContent };
          return updated;
        });
      }
    } catch {
      // fallback to non-streaming
      try {
        const r = await api.post("/api/v1/ai/completions", { prompt, conversation_id: selectedId });
        assistantContent = r.data.content;
        setMessages((prev) => { const u = [...prev]; u[u.length - 1] = { role: "assistant", content: assistantContent }; return u; });
      } catch { toast.error("AI request failed"); }
    } finally {
      setStreaming(false);
      qc.invalidateQueries({ queryKey: ["ai-conversations"] });
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <div className="flex h-full gap-4 min-h-0">
      {/* Sidebar */}
      <div className="w-64 shrink-0 flex flex-col gap-2">
        <Button size="sm" className="gap-2 w-full" onClick={() => newConv.mutate()} disabled={newConv.isPending}>
          <Plus className="h-4 w-4" />New Chat
        </Button>
        <ScrollArea className="flex-1">
          <div className="space-y-1 pr-3">
            {convsLoading ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9 rounded-lg" />) :
              conversations.map((c) => (
                <div key={c.id} className={cn("group flex items-center justify-between rounded-lg px-3 py-1.5 transition-colors text-sm",
                  selectedId === c.id ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted text-muted-foreground")}>
                  {editingId === c.id ? (
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={(e) => handleEditKeyDown(e, c.id)}
                      onBlur={() => {
                        if (editTitle.trim()) {
                          updateTitle.mutate({ id: c.id, title: editTitle.trim() });
                        } else {
                          setEditingId(null);
                        }
                      }}
                      className="bg-transparent border-0 outline-none text-foreground w-full py-0.5 px-1 rounded bg-background text-sm font-normal"
                      autoFocus
                    />
                  ) : (
                    <>
                      <button onClick={() => setSelectedId(c.id)} className="flex-1 text-left truncate pr-2 py-0.5">
                        {c.title}
                      </button>
                      <div className="flex items-center gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => startEditing(c.id, c.title)}
                          className={cn("hover:text-foreground", selectedId === c.id ? "text-primary-foreground/80 hover:text-primary-foreground" : "text-muted-foreground")}
                          title="Rename chat"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteId(c.id);
                          }}
                          className={cn("hover:text-destructive", selectedId === c.id ? "text-primary-foreground/80 hover:text-primary-foreground" : "text-muted-foreground")}
                          title="Delete chat"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
          </div>
        </ScrollArea>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-h-0 bg-card rounded-xl border border-border overflow-hidden">
        {!selectedId ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-8">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Sparkles className="h-8 w-8 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-lg">AI Assistant</p>
              <p className="text-sm text-muted-foreground mt-1">Powered by Groq llama-3.3-70b. Ask anything.</p>
            </div>
            <Button onClick={() => newConv.mutate()} className="gap-2"><Plus className="h-4 w-4" />Start New Chat</Button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="space-y-4 max-w-3xl mx-auto">
                {messages.map((m, i) => (
                  <div key={i} className={cn("flex gap-3", m.role === "user" ? "justify-end" : "justify-start")}>
                    {m.role === "assistant" && (
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                        <Bot className="h-4 w-4 text-primary" />
                      </div>
                    )}
                    <div className={cn("max-w-[80%] rounded-2xl px-4 py-3 text-sm text-foreground",
                      m.role === "user" ? "bg-primary text-primary-foreground rounded-tr-sm whitespace-pre-wrap" : "bg-muted rounded-tl-sm")}>
                      {m.role === "user" ? (
                        m.content
                      ) : (
                        <ReactMarkdown
                          components={{
                            p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
                            ul: ({ children }) => <ul className="list-disc pl-5 mb-2 space-y-1">{children}</ul>,
                            ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 space-y-1">{children}</ol>,
                            li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                            strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
                            h1: ({ children }) => <h1 className="text-base font-bold mt-3 mb-1 text-foreground">{children}</h1>,
                            h2: ({ children }) => <h2 className="text-sm font-bold mt-3 mb-1 text-foreground">{children}</h2>,
                            h3: ({ children }) => <h3 className="text-xs font-bold mt-2 mb-1 text-foreground">{children}</h3>,
                            code: ({ children }) => <code className="bg-muted-foreground/10 px-1 py-0.5 rounded text-xs font-mono">{children}</code>,
                          }}
                        >
                          {m.content || (streaming && i === messages.length - 1 ? "▊" : "")}
                        </ReactMarkdown>
                      )}
                    </div>
                    {m.role === "user" && (
                      <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0 mt-1">
                        <User className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
            </div>

            <div className="p-4 border-t border-border">
              <div className="flex gap-2 max-w-3xl mx-auto">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="Message AI assistant… (Enter to send, Shift+Enter for newline)"
                  className="resize-none min-h-[44px] max-h-36 bg-muted border-0 text-sm"
                  rows={1}
                />
                <Button size="icon" onClick={send} disabled={!input.trim() || streaming} className="shrink-0 self-end">
                  {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground text-center mt-2">Powered by Groq · llama-3.3-70b-versatile</p>
            </div>
          </>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Delete Chat</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this conversation? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 mt-4">
            <Button variant="ghost" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button 
              variant="destructive" 
              onClick={() => {
                if (deleteId) {
                  deleteConv.mutate(deleteId);
                  setDeleteId(null);
                }
              }}
              disabled={deleteConv.isPending}
            >
              {deleteConv.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
