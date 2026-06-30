"use client";

import { use, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Edit2, Save, X, Loader2, Tag } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import api from "@/lib/api";
import { KnowledgePage } from "@/types";

export default function KnowledgeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const { data: page, isLoading } = useQuery<KnowledgePage>({
    queryKey: ["knowledge-page", id],
    queryFn: () => api.get(`/api/v1/knowledge/documents/${id}`).then((r) => r.data),
  });

  // Sync local state when page data loads
  useEffect(() => {
    if (page) queueMicrotask(() => { setTitle(page.title); setContent(page.content); });
  }, [page]);

  const update = useMutation({
    mutationFn: () => api.patch(`/api/v1/knowledge/documents/${id}`, { title, content }).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["knowledge-page", id] }); toast.success("Saved"); setEditing(false); },
    onError: () => toast.error("Save failed"),
  });

  if (isLoading) return (
    <div className="space-y-4 max-w-4xl">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-96" />
    </div>
  );

  if (!page) return <p className="text-muted-foreground">Page not found</p>;

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/knowledge"><Button variant="ghost" size="sm" className="gap-1.5"><ArrowLeft className="h-3.5 w-3.5" />Knowledge Base</Button></Link>
        <div className="ml-auto flex gap-2">
          {editing ? (
            <>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditing(false)}><X className="h-3.5 w-3.5" />Cancel</Button>
              <Button size="sm" className="gap-1.5" onClick={() => update.mutate()} disabled={update.isPending}>
                {update.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}Save
              </Button>
            </>
          ) : (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { setTitle(page.title); setContent(page.content); setEditing(true); }}>
              <Edit2 className="h-3.5 w-3.5" />Edit
            </Button>
          )}
        </div>
      </div>

      {editing ? (
        <div className="space-y-4">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} className="text-2xl font-bold h-auto py-2 border-0 border-b rounded-none px-0 focus-visible:ring-0" />
          <Textarea value={content} onChange={(e) => setContent(e.target.value)} className="min-h-[60vh] font-mono text-sm resize-none" />
        </div>
      ) : (
        <div className="space-y-4">
          <h1 className="text-3xl font-bold">{page.title}</h1>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>{new Date(page.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</span>
            {page.tags?.length > 0 && (
              <div className="flex gap-1">
                {page.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs gap-1"><Tag className="h-2.5 w-2.5" />{tag}</Badge>
                ))}
              </div>
            )}
          </div>
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{page.content}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
