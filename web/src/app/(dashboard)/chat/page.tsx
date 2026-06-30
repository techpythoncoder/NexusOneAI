"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  Plus, Send, Hash, Lock, Loader2, MessageSquare, Users,
  Settings2, UserPlus, Trash2, Globe, ShieldCheck, Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import WebRTCCall from "@/components/chat/WebRTCCall";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import api from "@/lib/api";
import { Channel, ChannelMember, ChatMessage, Membership } from "@/types";
import { useAuthStore } from "@/store/auth-store";
import { cn } from "@/lib/utils";

// ── Schemas ───────────────────────────────────────────────────────────────────
const createSchema = z.object({
  name: z.string().min(1, "Name required").regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers, hyphens only"),
  channel_type: z.enum(["public", "private"]),
  description: z.string().optional(),
});
type CreateForm = z.infer<typeof createSchema>;

// ── @Mention autocomplete ─────────────────────────────────────────────────────
function MentionInput({
  value,
  onChange,
  onSend,
  members,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  members: Membership[];
}) {
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionStart, setMentionStart] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  const displayName = (m: Membership) => m.user_name?.trim() || m.user_email || "?";

  const filtered = members.filter((m) => {
    const q = mentionQuery.toLowerCase();
    return (
      (m.user_name && m.user_name.toLowerCase().includes(q)) ||
      (m.user_email && m.user_email.toLowerCase().includes(q))
    );
  }).slice(0, 6);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    onChange(v);
    const cursor = e.target.selectionStart ?? v.length;
    const before = v.slice(0, cursor);
    const atIdx = before.lastIndexOf("@");
    if (atIdx !== -1 && !before.slice(atIdx).includes(" ")) {
      setMentionStart(atIdx);
      setMentionQuery(before.slice(atIdx + 1));
      setMentionOpen(true);
    } else {
      setMentionOpen(false);
      setMentionStart(-1);
    }
  };

  const insertMention = (m: Membership) => {
    const before = value.slice(0, mentionStart);
    const after = value.slice(mentionStart + 1 + mentionQuery.length);
    const name = (m.user_name || m.user_email || "").trim().replace(/\s+/g, "");
    const newVal = `${before}@${name} ${after}`;
    onChange(newVal);
    setMentionOpen(false);
    inputRef.current?.focus();
  };

  return (
    <div className="relative flex-1">
      {mentionOpen && filtered.length > 0 && (
        <div className="absolute bottom-full mb-2 left-0 w-72 bg-popover border border-border rounded-xl shadow-lg overflow-hidden z-50">
          <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border">
            Mention a member
          </p>
          {filtered.map((m) => (
            <button
              key={m.user_id}
              onMouseDown={(e) => { e.preventDefault(); insertMention(m); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-muted text-sm text-left"
            >
              <Avatar className="h-6 w-6 shrink-0">
                <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                  {displayName(m)[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col min-w-0">
                <span className="truncate font-medium">{displayName(m)}</span>
                {m.user_name && <span className="truncate text-[10px] text-muted-foreground">{m.user_email}</span>}
              </div>
              <Badge variant="outline" className="ml-auto text-[10px] capitalize shrink-0">{m.role}</Badge>
            </button>
          ))}
        </div>
      )}
      <Input
        ref={inputRef}
        value={value}
        onChange={handleChange}
        onKeyDown={(e) => {
          if (e.key === "Escape") setMentionOpen(false);
          if (e.key === "Enter" && !mentionOpen) onSend();
        }}
        placeholder="Message... (@ to mention)"
        className="flex-1"
      />
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ChatPage() {
  const qc = useQueryClient();
  const { user, org, token: authToken } = useAuthStore();

  const [selected, setSelected] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [msgInput, setMsgInput] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [addMemberEmail, setAddMemberEmail] = useState("");
  const [activeCall, setActiveCall] = useState(false);
  const [incomingSignal, setIncomingSignal] = useState<any | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // ── Queries ─────────────────────────────────────────────────────────────────
  const { data: channels = [], isLoading } = useQuery<Channel[]>({
    queryKey: ["channels", org?.id],
    queryFn: () => api.get("/api/v1/chat/channels").then((r) => r.data),
    enabled: !!org,
    refetchInterval: 15000,
  });

  const { data: history = [] } = useQuery<ChatMessage[]>({
    queryKey: ["messages", selected?.id],
    queryFn: () => api.get(`/api/v1/chat/channels/${selected!.id}/messages`).then((r) => r.data),
    enabled: !!selected,
  });

  const { data: channelMembers = [] } = useQuery<ChannelMember[]>({
    queryKey: ["channel-members", selected?.id],
    queryFn: () => api.get(`/api/v1/chat/channels/${selected!.id}/members`).then((r) => r.data),
    enabled: !!selected && selected.channel_type === "private",
  });

  const { data: orgMembers = [] } = useQuery<Membership[]>({
    queryKey: ["members", org?.id],
    queryFn: () => api.get(`/api/v1/orgs/${org?.id}/members`).then((r) => r.data),
    enabled: !!org,
  });

  const getSenderName = useCallback((senderId: string, senderEmail: string) => {
    const member = orgMembers.find((m) => m.user_id === senderId);
    return member?.user_name?.trim() || senderEmail;
  }, [orgMembers]);

  useEffect(() => { if (history.length) setMessages(history); }, [history]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // ── WebSocket ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const token = (typeof window !== "undefined" ? localStorage.getItem("nexus_token") : null) || authToken;
    if (!selected || !user || !org || !token) return;
    
    wsRef.current?.close();
    setMessages([]);

    let reconnectTimeout: any = null;
    let isCleanup = false;

    const connect = () => {
      if (isCleanup) return;
      
      const base = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/^http/, "ws");
      const ws = new WebSocket(`${base}/api/v1/chat/channels/${selected.id}/ws?token=${encodeURIComponent(token)}&org_id=${org.id}`);

      ws.onmessage = (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          console.log("WebSocket event received:", data);
          
          if (data.type === "rtc-signal") {
            // Ignore loopback signals sent by ourselves
            if (data.sender_id === user.id) {
              return;
            }
            setIncomingSignal(data);
            setActiveCall(true);
          } else if (data.type === "message") {
            setMessages((prev) => [...prev, {
              id: data.id,
              channel_id: selected.id,
              sender_id: data.sender_id,
              sender_email: data.sender_email,
              content: data.content,
              created_at: data.created_at,
            }]);
            qc.invalidateQueries({ queryKey: ["channels", org.id] });
          }
        } catch (err) {
          console.error("Error parsing WS frame:", err);
        }
      };

      ws.onclose = () => {
        if (!isCleanup) {
          console.log("WebSocket closed. Attempting auto-reconnect in 3s...");
          reconnectTimeout = setTimeout(connect, 3000);
        }
      };

      ws.onerror = (err) => {
        console.error("WebSocket connection error:", err);
      };

      wsRef.current = ws;
    };

    connect();

    return () => {
      isCleanup = true;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [selected?.id, user?.id, org?.id, authToken]);

  const sendMessage = useCallback(() => {
    if (!msgInput.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ content: msgInput.trim() }));
    setMsgInput("");
  }, [msgInput]);

  // ── Create channel ───────────────────────────────────────────────────────────
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { channel_type: "public" },
  });
  const watchedType = watch("channel_type");

  const createChannel = useMutation({
    mutationFn: (d: CreateForm) => api.post("/api/v1/chat/channels", d).then((r) => r.data),
    onSuccess: (ch: Channel) => {
      qc.invalidateQueries({ queryKey: ["channels", org?.id] });
      toast.success(`#${ch.name} created`);
      reset();
      setCreateOpen(false);
      setSelected(ch);
    },
    onError: () => toast.error("Failed to create channel"),
  });

  // ── Add member to private channel ────────────────────────────────────────────
  const addMember = useMutation({
    mutationFn: ({ userId, userEmail }: { userId: string; userEmail: string }) =>
      api.post(`/api/v1/chat/channels/${selected?.id}/members`, { user_id: userId, user_email: userEmail }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["channel-members", selected?.id] });
      qc.invalidateQueries({ queryKey: ["channels", org?.id] });
      setAddMemberEmail("");
      toast.success("Member added");
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg || "Failed to add member");
    },
  });

  const removeMember = useMutation({
    mutationFn: (userId: string) =>
      api.delete(`/api/v1/chat/channels/${selected?.id}/members/${userId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["channel-members", selected?.id] });
      qc.invalidateQueries({ queryKey: ["channels", org?.id] });
      toast.success("Member removed");
    },
    onError: () => toast.error("Failed to remove member"),
  });

  const handleAddByEmail = () => {
    const target = orgMembers.find((m) => m.user_email?.toLowerCase() === addMemberEmail.toLowerCase());
    if (!target) { toast.error("No org member found with that email"); return; }
    addMember.mutate({ userId: target.user_id, userEmail: target.user_email || "" });
  };

  const selectChannel = (ch: Channel) => {
    setSelected(ch);
    // Optimistically clear unread count in the list
    qc.setQueryData<Channel[]>(["channels", org?.id], (prev) =>
      prev?.map((c) => c.id === ch.id ? { ...c, unread_count: 0 } : c) ?? []
    );
  };

  const publicChannels = channels.filter((c) => c.channel_type === "public");
  const privateChannels = channels.filter((c) => c.channel_type === "private");

  // Check if there is an active call in the channel based on message history
  const hasActiveCall = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const content = messages[i].content;
      if (content === "📞 Video call ended" || content === "❌ Call missed") {
        return false;
      }
      if (content === "🎥 Started a video call") {
        return true;
      }
    }
    return false;
  })();

  return (
    <div className="flex h-full gap-0 min-h-0 rounded-xl border border-border overflow-hidden bg-card">

      {/* ── Left: channel list ─────────────────────────────────────────── */}
      <div className="w-60 shrink-0 border-r border-border flex flex-col bg-card">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Channels</span>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>

        <ScrollArea className="flex-1 py-2">
          {isLoading ? (
            <div className="px-3 space-y-1.5">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 rounded-lg" />)}
            </div>
          ) : (
            <div className="px-2 space-y-4">
              {/* Public channels */}
              {publicChannels.length > 0 && (
                <div>
                  <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">Public</p>
                  <div className="space-y-0.5">
                    {publicChannels.map((c) => (
                      <ChannelButton key={c.id} channel={c} active={selected?.id === c.id} onClick={() => selectChannel(c)} />
                    ))}
                  </div>
                </div>
              )}
              {/* Private channels */}
              {privateChannels.length > 0 && (
                <div>
                  <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">Private</p>
                  <div className="space-y-0.5">
                    {privateChannels.map((c) => (
                      <ChannelButton key={c.id} channel={c} active={selected?.id === c.id} onClick={() => selectChannel(c)} />
                    ))}
                  </div>
                </div>
              )}
              {channels.length === 0 && (
                <p className="px-3 py-4 text-xs text-muted-foreground text-center">No channels yet. Create one!</p>
              )}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* ── Right: message area ────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-0">
        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <MessageSquare className="h-10 w-10 opacity-30" />
            <p className="text-sm">Select a channel to start chatting</p>
          </div>
        ) : (
          <>
            {/* Channel header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card">
              {selected.channel_type === "private"
                ? <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
                : <Hash className="h-4 w-4 text-muted-foreground shrink-0" />
              }
              <span className="font-semibold">{selected.name}</span>
              <Badge
                variant="outline"
                className={cn("text-xs gap-1", selected.channel_type === "private"
                  ? "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-500/10 dark:text-purple-400 dark:border-purple-500/20"
                  : "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20"
                )}
              >
                {selected.channel_type === "private"
                  ? <><ShieldCheck className="h-3 w-3" /> Private</>
                  : <><Globe className="h-3 w-3" /> Public</>
                }
              </Badge>
              {selected.channel_type === "private" && selected.member_count !== null && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Users className="h-3.5 w-3.5" />
                  {selected.member_count} {selected.member_count === 1 ? "member" : "members"}
                </div>
              )}
              {selected.description && (
                <span className="text-xs text-muted-foreground truncate max-w-[200px]">{selected.description}</span>
              )}
              {/* Video Call button */}
              <Button
                variant="ghost" size="icon"
                className="h-7 w-7 ml-auto"
                onClick={() => setActiveCall(true)}
                title="Start Video Call"
              >
                <Video className="h-4 w-4 text-indigo-500" />
              </Button>

              {selected.channel_type === "private" && (
                <Button
                  variant="ghost" size="icon"
                  className="h-7 w-7 ml-1"
                  onClick={() => setMembersOpen(true)}
                  title="Manage members"
                >
                  <Users className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* Active Call Banner (like Teams) */}
            {hasActiveCall && !activeCall && (
              <div className="bg-indigo-600/10 border-b border-indigo-500/20 px-4 py-3 flex items-center justify-between gap-4 animate-fade-in">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                  </span>
                  <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">Video call in progress...</span>
                </div>
                <Button 
                  size="sm" 
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs px-4 h-8 rounded-lg flex items-center gap-1.5 shadow-md shadow-indigo-500/10"
                  onClick={() => {
                    setActiveCall(true);
                  }}
                >
                  <Video className="h-3.5 w-3.5" /> Join Call
                </Button>
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 min-h-0 space-y-3" style={{ scrollBehavior: "smooth" }}>
                {messages.map((m, i) => {
                  const isMe = m.sender_id === user?.id;
                  const prevMsg = messages[i - 1];
                  const showAvatar = !isMe && m.sender_email !== prevMsg?.sender_email;
                  return (
                    <div key={m.id} className={cn("flex gap-2.5", isMe ? "justify-end" : "justify-start")}>
                      {!isMe && (
                        <div className="w-7 shrink-0 mt-1">
                          {showAvatar && (
                            <Avatar className="h-7 w-7">
                              <AvatarFallback className="text-[10px] bg-muted">
                                {getSenderName(m.sender_id, m.sender_email)[0].toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                          )}
                        </div>
                      )}
                      <div className={cn("max-w-[75%] flex flex-col", isMe ? "items-end" : "items-start")}>
                        {showAvatar && !isMe && (
                          <p className="text-[11px] text-muted-foreground mb-0.5 px-1">
                            {getSenderName(m.sender_id, m.sender_email)}
                          </p>
                        )}
                        <div className={cn(
                          "rounded-2xl px-3 py-2 text-sm leading-relaxed",
                          isMe ? "bg-primary text-primary-foreground rounded-tr-sm" : "bg-muted rounded-tl-sm"
                        )}>
                          {renderContent(m.content, isMe)}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5 px-1">
                          {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                  );
                })}
                {messages.length === 0 && (
                  <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
                    <Hash className="h-8 w-8 opacity-30" />
                    <p className="text-sm">No messages yet. Say hello!</p>
                  </div>
                )}
                <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="p-3 border-t border-border flex gap-2 items-center">
              <MentionInput
                value={msgInput}
                onChange={setMsgInput}
                onSend={sendMessage}
                members={orgMembers.filter((m) => m.user_id !== user?.id)}
              />
              <Button
                size="icon"
                onClick={sendMessage}
                disabled={!msgInput.trim()}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </>
        )}
      </div>

      {/* ── Create channel dialog ──────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create a channel</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit((d) => createChannel.mutate(d))} className="space-y-4 mt-1">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select defaultValue="public" onValueChange={(v) => setValue("channel_type", v as "public" | "private")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">
                    <div className="flex items-center gap-2">
                      <Globe className="h-3.5 w-3.5 text-blue-500" />
                      <div>
                        <p className="font-medium">Public</p>
                        <p className="text-xs text-muted-foreground">All org members can see and join</p>
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="private">
                    <div className="flex items-center gap-2">
                      <Lock className="h-3.5 w-3.5 text-purple-500" />
                      <div>
                        <p className="font-medium">Private</p>
                        <p className="text-xs text-muted-foreground">Only invited members can access</p>
                      </div>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Channel name</Label>
              <div className="flex items-center gap-1.5">
                {watchedType === "private"
                  ? <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
                  : <Hash className="h-4 w-4 text-muted-foreground shrink-0" />
                }
                <Input placeholder="e.g. engineering" {...register("name")} className="lowercase" />
              </div>
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
              <p className="text-xs text-muted-foreground">Lowercase letters, numbers, hyphens only</p>
            </div>
            <div className="space-y-1.5">
              <Label>Description <span className="text-muted-foreground">(optional)</span></Label>
              <Input placeholder="What's this channel for?" {...register("description")} />
            </div>
            <Button type="submit" className="w-full" disabled={createChannel.isPending}>
              {createChannel.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create {watchedType} channel
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Manage members dialog (private channels) ───────────────────── */}
      <Dialog open={membersOpen} onOpenChange={setMembersOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-4 w-4" />
              #{selected?.name} members
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Add member */}
            <div className="space-y-2">
              <Label>Add org member</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    placeholder="member@example.com"
                    value={addMemberEmail}
                    onChange={(e) => setAddMemberEmail(e.target.value)}
                    list="org-member-emails"
                  />
                  <datalist id="org-member-emails">
                    {orgMembers
                      .filter((m) => !channelMembers.some((cm) => cm.user_id === m.user_id))
                      .map((m) => <option key={m.user_id} value={m.user_email} />)}
                  </datalist>
                </div>
                <Button
                  size="sm"
                  onClick={handleAddByEmail}
                  disabled={!addMemberEmail.trim() || addMember.isPending}
                >
                  {addMember.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <Separator />

            {/* Member list */}
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {channelMembers.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No members yet</p>
              )}
              {channelMembers.map((m) => (
                <div key={m.user_id} className="flex items-center gap-2.5 py-2 px-1">
                  <Avatar className="h-7 w-7 shrink-0">
                    <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                      {m.user_email[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm flex-1 truncate">{m.user_email}</span>
                  {m.user_id !== user?.id && (
                    <button
                      onClick={() => removeMember.mutate(m.user_id)}
                      disabled={removeMember.isPending}
                      className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* WebRTC Video Call Overlay */}
      {activeCall && selected && user && (
        <WebRTCCall
          channelId={selected.id}
          channelName={selected.name}
          ws={wsRef.current}
          currentUser={{ id: user.id, email: user.email, full_name: user.full_name }}
          incomingSignal={incomingSignal}
          onClose={() => setActiveCall(false)}
          onClearIncomingSignal={() => setIncomingSignal(null)}
          orgMembers={orgMembers}
        />
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ChannelButton({ channel, active, onClick }: { channel: Channel; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors group",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      {channel.channel_type === "private"
        ? <Lock className="h-3.5 w-3.5 shrink-0 opacity-70" />
        : <Hash className="h-3.5 w-3.5 shrink-0 opacity-70" />
      }
      <span className="truncate flex-1">{channel.name}</span>
      {channel.unread_count > 0 && !active && (
        <span className="ml-auto text-[10px] font-bold bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 min-w-[18px] text-center leading-none">
          {channel.unread_count > 99 ? "99+" : channel.unread_count}
        </span>
      )}
      {channel.channel_type === "private" && channel.member_count !== null && active && (
        <span className="ml-auto text-[10px] opacity-70 flex items-center gap-0.5">
          <Users className="h-3 w-3" />{channel.member_count}
        </span>
      )}
    </button>
  );
}

function renderContent(content: string, isMe = false) {
  const parts = content.split(/(@[\w.+-]+@[\w.-]+\.\w+|@[\w.+-]+)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("@") ? (
          // Own-message bubble: primary bg → foreground-colored highlight with opacity bg
          // Others' bubble: muted bg → primary-colored highlight
          <span
            key={i}
            className={cn(
              "font-semibold rounded px-0.5",
              isMe
                ? "bg-primary-foreground/20 text-primary-foreground"
                : "bg-primary/10 text-primary"
            )}
          >
            {part}
          </span>
        ) : (
          <span key={i} className="text-inherit">{part}</span>
        )
      )}
    </>
  );
}
