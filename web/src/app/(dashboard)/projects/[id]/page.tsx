"use client";

import { useState, useEffect } from "react";
import { use } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, Loader2, ArrowLeft, GripVertical, MessageSquare } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { DndContext, DragEndEvent, closestCenter, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { Task, Membership, Project, Comment } from "@/types";
import { useAuthStore } from "@/store/auth-store";

const COLUMNS = [
  { id: "todo",       label: "To Do",       color: "bg-slate-500/10 text-slate-500" },
  { id: "in_progress",label: "In Progress", color: "bg-blue-500/10 text-blue-500" },
  { id: "in_review",  label: "In Review",   color: "bg-amber-500/10 text-amber-500" },
  { id: "done",       label: "Done",        color: "bg-emerald-500/10 text-emerald-500" },
];

const PRIORITY_COLOR: Record<string, string> = {
  low: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  medium: "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400",
  high: "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400",
  critical: "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400",
  urgent: "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400",
};

const schema = z.object({
  title: z.string().min(1, "Title required"),
  description: z.string().optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  status: z.literal("todo"),
  assignee_id: z.string().min(1, "Assignee required"),
});
type FormData = z.infer<typeof schema>;

function TaskCard({ task, onClick }: { task: Task; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="bg-card border border-border rounded-lg p-3 cursor-pointer hover:border-primary/40 transition-colors space-y-2 relative group flex flex-col"
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium line-clamp-2 text-foreground">{task.title}</p>
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-muted text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </div>
      </div>
      {task.description && <p className="text-xs text-muted-foreground line-clamp-2">{task.description}</p>}
      <div className="flex items-center gap-2 mt-auto pt-1">
        <Badge variant="outline" className={`text-xs px-1.5 py-0 h-5 capitalize ${PRIORITY_COLOR[task.priority.toLowerCase()] || PRIORITY_COLOR.medium}`}>
          {task.priority.toLowerCase()}
        </Badge>
        {task.due_date && <span className="text-xs text-muted-foreground">{new Date(task.due_date).toLocaleDateString()}</span>}
      </div>
    </div>
  );
}

export default function KanbanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const org = useAuthStore((s) => s.org);
  const user = useAuthStore((s) => s.user);

  // Task detail states
  const [detailOpen, setDetailOpen] = useState(false);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editPriority, setEditPriority] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editAssignee, setEditAssignee] = useState("");
  const [newComment, setNewComment] = useState("");

  // Nested reply states
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  const { data: project } = useQuery<Project>({
    queryKey: ["project", id],
    queryFn: () => api.get(`/api/v1/projects/${id}`).then((r) => r.data),
  });

  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ["tasks", id],
    queryFn: () => api.get(`/api/v1/projects/${id}/tasks/`).then((r) => r.data),
  });

  const { data: members = [] } = useQuery<Membership[]>({
    queryKey: ["members", org?.id],
    queryFn: () => api.get(`/api/v1/orgs/${org?.id}/members`).then((r) => r.data),
    enabled: !!org,
  });

  const { data: comments = [], refetch: refetchComments } = useQuery<Comment[]>({
    queryKey: ["task-comments", activeTask?.id],
    queryFn: () => api.get(`/api/v1/projects/${id}/tasks/${activeTask?.id}/comments`).then((r) => r.data),
    enabled: !!activeTask && detailOpen,
  });

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema), defaultValues: { priority: "medium", status: "todo", assignee_id: "" },
  });

  const create = useMutation({
    mutationFn: (data: FormData) => {
      const assignee = members.find((m) => m.user_id === data.assignee_id);
      return api.post(`/api/v1/projects/${id}/tasks/`, {
        ...data,
        status: data.status.toUpperCase(),
        priority: data.priority === "urgent" ? "CRITICAL" : data.priority.toUpperCase(),
        assignee_email: assignee?.user_email || null,
      }).then((r) => r.data);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tasks", id] }); toast.success("Task created"); reset(); setOpen(false); },
    onError: () => toast.error("Failed to create task"),
  });

  const updateStatus = useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: string }) =>
      api.patch(`/api/v1/projects/${id}/tasks/${taskId}`, { status: status.toUpperCase() }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks", id] }),
  });

  const updateTask = useMutation({
    mutationFn: (data: any) =>
      api.patch(`/api/v1/projects/${id}/tasks/${activeTask?.id}`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks", id] });
      toast.success("Task updated");
      setDetailOpen(false);
    },
    onError: () => toast.error("Failed to update task"),
  });

  const addComment = useMutation({
    mutationFn: ({ content, parent_id, mentioned_emails, mentioned_user_ids }: { content: string; parent_id?: string; mentioned_emails?: string[]; mentioned_user_ids?: string[] }) =>
      api.post(`/api/v1/projects/${id}/tasks/${activeTask?.id}/comments`, { content, parent_id, mentioned_emails, mentioned_user_ids }).then((r) => r.data),
    onSuccess: () => {
      refetchComments();
      setNewComment("");
      setReplyToId(null);
      setReplyText("");
      toast.success("Comment added");
    },
    onError: () => toast.error("Failed to add comment"),
  });

  const handleCardClick = (task: Task) => {
    setActiveTask(task);
    setEditTitle(task.title);
    setEditDesc(task.description || "");
    setEditPriority(task.priority.toLowerCase());
    setEditStatus(task.status.toLowerCase());
    setEditAssignee(task.assignee_id || "");
    setDetailOpen(true);
  };

  useEffect(() => {
    const taskIdParam = searchParams.get("task");
    if (taskIdParam && tasks.length > 0) {
      const task = tasks.find((t) => t.id === taskIdParam);
      if (task) {
        handleCardClick(task);
      }
    }
  }, [searchParams, tasks]);

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const newStatus = over.id as string;
    if (COLUMNS.find((c) => c.id === newStatus)) {
      updateStatus.mutate({ taskId: active.id as string, status: newStatus });
    }
  };

  const tasksByStatus = (status: string) => tasks.filter((t) => t.status.toLowerCase() === status.toLowerCase());

  // Get user display name (fallback to email prefix if full name not present)
  const getDisplayName = (userId: string) => {
    if (userId === user?.id && user?.full_name) {
      return user.full_name;
    }
    const member = members.find((m) => m.user_id === userId);
    if (member?.user_email) {
      const prefix = member.user_email.split("@")[0];
      return prefix.charAt(0).toUpperCase() + prefix.slice(1);
    }
    return userId;
  };

  // Helper to parse if mention query is being typed
  const checkMention = (text: string) => {
    const parts = text.split(/\s+/);
    const lastWord = parts[parts.length - 1];
    if (lastWord.startsWith("@")) {
      return lastWord.slice(1);
    }
    return null;
  };

  // Parse text for @mentions and map to email addresses and user IDs
  const getMentions = (text: string) => {
    const emails: string[] = [];
    const userIds: string[] = [];
    const words = text.split(/\s+/);
    for (const word of words) {
      if (word.startsWith("@")) {
        const name = word.slice(1).replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "");
        const member = members.find((m) => getDisplayName(m.user_id).toLowerCase() === name.toLowerCase());
        if (member) {
          if (member.user_email) {
            emails.push(member.user_email);
          }
          userIds.push(member.user_id);
        }
      }
    }
    return {
      mentioned_emails: Array.from(new Set(emails)),
      mentioned_user_ids: Array.from(new Set(userIds)),
    };
  };

  // Recursively render nested comments
  const rootComments = comments.filter((c) => !c.parent_id);
  const getReplies = (parentId: string) => comments.filter((c) => c.parent_id === parentId);

  const renderCommentNode = (c: Comment, depth = 0) => {
    const authorName = getDisplayName(c.author_id);
    const authorEmail = members.find((m) => m.user_id === c.author_id)?.user_email || "";
    const replies = getReplies(c.id);

    // Mention state for this specific comment's reply box
    const isReplyingToThis = replyToId === c.id;
    const replyMentionSearch = isReplyingToThis ? checkMention(replyText) : null;

    return (
      <div key={c.id} className={cn("space-y-2", depth > 0 && "pl-4 border-l border-border/80 ml-2 mt-2")}>
        <div className="bg-card border border-border p-3 rounded-lg text-xs space-y-1.5 relative shadow-xs">
          <div className="flex justify-between font-medium text-muted-foreground">
            <span className="font-semibold text-primary/80 truncate max-w-[280px]">
              {authorName} <span className="text-[10px] font-normal text-muted-foreground/75">({authorEmail || "member"})</span>
            </span>
            <span>{new Date(c.created_at).toLocaleString()}</span>
          </div>
          <p className="text-foreground leading-relaxed whitespace-pre-wrap">{c.content}</p>
          
          <div className="flex items-center gap-2 pt-1 border-t border-border/10">
            <button
              onClick={() => {
                setReplyToId(replyToId === c.id ? null : c.id);
                setReplyText("");
              }}
              className="text-[10px] font-semibold text-primary hover:underline cursor-pointer"
            >
              {replyToId === c.id ? "Cancel Reply" : "Reply"}
            </button>
          </div>

          {replyToId === c.id && (
            <div className="relative mt-2 pt-2 border-t border-border/20">
              {/* Reply Mention Dropdown: Shows only the author of the comment being replied to */}
              {replyMentionSearch !== null && (
                <div className="absolute bottom-full left-0 mb-1 w-64 bg-popover border border-border rounded-lg shadow-lg z-50 p-1">
                  <button
                    type="button"
                    onClick={() => {
                      const parts = replyText.split(/\s+/);
                      parts[parts.length - 1] = `@${authorName}`;
                      setReplyText(parts.join(" ") + " ");
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded hover:bg-muted text-xs flex flex-col cursor-pointer text-foreground"
                  >
                    <span className="font-medium">{authorName}</span>
                    <span className="text-[10px] text-muted-foreground">{authorEmail}</span>
                  </button>
                </div>
              )}

              <div className="flex gap-2">
                <Input
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder={`Reply to ${authorName}... (type @ for mention)`}
                  className="h-7 text-[11px] bg-background text-foreground"
                  autoFocus
                />
                <Button
                  size="sm"
                  onClick={() => {
                    if (replyText.trim()) {
                      const { mentioned_emails, mentioned_user_ids } = getMentions(replyText.trim());
                      addComment.mutate({ content: replyText.trim(), parent_id: c.id, mentioned_emails, mentioned_user_ids });
                    }
                  }}
                  disabled={addComment.isPending}
                  className="h-7 text-[10px] px-2"
                >
                  Post
                </Button>
              </div>
            </div>
          )}
        </div>

        {replies.map((reply) => renderCommentNode(reply, depth + 1))}
      </div>
    );
  };

  const rootMentionSearch = checkMention(newComment);
  const filteredMentionMembers = rootMentionSearch !== null ? members.filter((m) => {
    const name = getDisplayName(m.user_id).toLowerCase();
    const email = (m.user_email || "").toLowerCase();
    return name.includes(rootMentionSearch.toLowerCase()) || email.includes(rootMentionSearch.toLowerCase());
  }) : [];

  return (
    <div className="space-y-4 h-full flex flex-col">
      <div className="flex items-center gap-4 shrink-0">
        <Link href="/projects"><Button variant="ghost" size="sm" className="gap-1.5"><ArrowLeft className="h-3.5 w-3.5" />Projects</Button></Link>
        <h2 className="font-semibold text-lg">{project?.name ?? "Loading..."}</h2>
        <div className="ml-auto">
          <Button size="sm" className="gap-2" onClick={() => setOpen(true)}><Plus className="h-4 w-4" />Add Task</Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent>
              <DialogHeader><DialogTitle>Create task</DialogTitle></DialogHeader>
              <form onSubmit={handleSubmit((d) => create.mutate(d))} className="space-y-4 mt-2">
                <div className="space-y-1">
                  <Label>Title</Label>
                  <Input placeholder="Task title" {...register("title")} />
                  {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
                </div>
                <div className="space-y-1">
                  <Label>Description</Label>
                  <Textarea placeholder="Details..." {...register("description")} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Priority</Label>
                    <Select defaultValue="medium" onValueChange={(v) => setValue("priority", v as FormData["priority"])}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Assignee</Label>
                    <select
                      {...register("assignee_id")}
                      className="flex h-8 w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-background py-1 px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 dark:hover:bg-input/50 dark:text-white text-black"
                    >
                      <option value="" disabled className="bg-popover text-popover-foreground dark:bg-slate-900 dark:text-white">Select assignee...</option>
                      {members.map((m) => (
                        <option key={m.user_id} value={m.user_id} className="bg-popover text-popover-foreground dark:bg-slate-900 dark:text-white">
                          {m.user_email || m.user_id}
                        </option>
                      ))}
                    </select>
                    {errors.assignee_id && <p className="text-xs text-destructive">{errors.assignee_id.message}</p>}
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={create.isPending}>
                  {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Kanban Board */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-4 gap-4 flex-1 min-h-0">
          {COLUMNS.map((col) => (
            <div key={col.id} className="flex flex-col gap-3 min-h-0">
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant="secondary" className={col.color}>{col.label}</Badge>
                <span className="text-xs text-muted-foreground ml-auto">{tasksByStatus(col.id).length}</span>
              </div>
              <SortableContext id={col.id} items={tasksByStatus(col.id).map((t) => t.id)} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col gap-2 flex-1 bg-muted/30 rounded-xl p-2 min-h-24 overflow-y-auto">
                  {isLoading
                    ? Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)
                    : tasksByStatus(col.id).map((task) => (
                        <TaskCard key={task.id} task={task} onClick={() => handleCardClick(task)} />
                      ))
                  }
                </div>
              </SortableContext>
            </div>
          ))}
        </div>
      </DndContext>

      {/* Task Details Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-4 overflow-hidden bg-card text-card-foreground">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <span>Task #{activeTask?.task_number}: {activeTask?.title}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto pr-2 space-y-4 text-sm min-h-0">
            {/* Title & Desc */}
            <div className="space-y-1">
              <Label className="text-muted-foreground">Title</Label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="bg-background text-foreground" />
            </div>
            <div className="space-y-1">
              <Label className="text-muted-foreground">Description</Label>
              <Textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={3} placeholder="Add description..." className="bg-background text-foreground" />
            </div>

            {/* Properties Grid */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-muted-foreground">Status</Label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="flex h-8 w-full rounded-lg border border-input bg-background py-1 px-2 text-sm outline-none dark:bg-input/30 text-foreground"
                >
                  {COLUMNS.map((c) => (
                    <option key={c.id} value={c.id} className="bg-popover text-popover-foreground dark:bg-slate-900">{c.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-muted-foreground">Priority</Label>
                <select
                  value={editPriority}
                  onChange={(e) => setEditPriority(e.target.value)}
                  className="flex h-8 w-full rounded-lg border border-input bg-background py-1 px-2 text-sm outline-none dark:bg-input/30 text-foreground"
                >
                  <option value="low" className="bg-popover text-popover-foreground dark:bg-slate-900">Low</option>
                  <option value="medium" className="bg-popover text-popover-foreground dark:bg-slate-900">Medium</option>
                  <option value="high" className="bg-popover text-popover-foreground dark:bg-slate-900">High</option>
                  <option value="critical" className="bg-popover text-popover-foreground dark:bg-slate-900">Critical</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-muted-foreground">Assignee</Label>
                <select
                  value={editAssignee}
                  onChange={(e) => setEditAssignee(e.target.value)}
                  className="flex h-8 w-full rounded-lg border border-input bg-background py-1 px-2 text-sm outline-none dark:bg-input/30 text-foreground"
                >
                  <option value="" className="bg-popover text-popover-foreground dark:bg-slate-900">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.user_id} value={m.user_id} className="bg-popover text-popover-foreground dark:bg-slate-900">{getDisplayName(m.user_id)}</option>
                  ))}
                </select>
              </div>
            </div>

            <hr className="border-border my-2" />

            {/* Comments Section */}
            <div className="space-y-2">
              <h3 className="font-semibold text-sm flex items-center gap-1.5"><MessageSquare className="h-4 w-4" />Comments ({comments.length})</h3>
              <ScrollArea className="h-40 rounded-md border border-border p-2 bg-muted/20">
                {comments.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-8">No comments yet.</p>
                ) : (
                  <div className="space-y-3">
                    {rootComments.map((c) => renderCommentNode(c))}
                  </div>
                )}
              </ScrollArea>

              {/* Main Comment Input with Autocomplete Mention */}
              <div className="relative flex gap-2">
                {rootMentionSearch !== null && filteredMentionMembers.length > 0 && (
                  <div className="absolute bottom-full left-0 mb-1 w-64 bg-popover border border-border rounded-lg shadow-lg z-50 max-h-36 overflow-y-auto p-1 space-y-0.5">
                    {filteredMentionMembers.map((m) => {
                      const mName = getDisplayName(m.user_id);
                      return (
                        <button
                          key={m.user_id}
                          type="button"
                          onClick={() => {
                            const parts = newComment.split(/\s+/);
                            parts[parts.length - 1] = `@${mName}`;
                            setNewComment(parts.join(" ") + " ");
                          }}
                          className="w-full text-left px-2.5 py-1.5 rounded hover:bg-muted text-xs flex flex-col cursor-pointer text-foreground"
                        >
                          <span className="font-medium">{mName}</span>
                          <span className="text-[10px] text-muted-foreground">{m.user_email}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                <Input
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Write a comment... (type @ for mentions)"
                  className="h-8 text-xs bg-background text-foreground"
                />
                <Button
                  size="sm"
                  onClick={() => {
                    if (newComment.trim()) {
                      const { mentioned_emails, mentioned_user_ids } = getMentions(newComment.trim());
                      addComment.mutate({ content: newComment.trim(), mentioned_emails, mentioned_user_ids });
                    }
                  }}
                  disabled={addComment.isPending}
                  className="h-8 shrink-0"
                >
                  Add Comment
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter className="border-t border-border pt-3">
            <Button variant="ghost" onClick={() => setDetailOpen(false)}>Cancel</Button>
             <Button onClick={() => {
              const assignee = members.find((m) => m.user_id === editAssignee);
              updateTask.mutate({
                title: editTitle,
                description: editDesc,
                priority: editPriority === "critical" ? "CRITICAL" : editPriority.toUpperCase(),
                status: editStatus.toUpperCase(),
                assignee_id: editAssignee || null,
                assignee_email: assignee?.user_email || null,
              });
            }} disabled={updateTask.isPending}>
              {updateTask.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
