"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, BookOpen, Loader2, Search, Tag } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import api from "@/lib/api";
import { KnowledgePage } from "@/types";

const schema = z.object({
  title: z.string().min(1, "Title required"),
  content: z.string().min(1, "Content required"),
  tags: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

export default function KnowledgePage_() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: pages = [], isLoading } = useQuery<KnowledgePage[]>({
    queryKey: ["knowledge-pages"],
    queryFn: () => api.get("/api/v1/knowledge/documents").then((r) => r.data),
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({ resolver: zodResolver(schema) });

  const create = useMutation({
    mutationFn: (data: FormData) => api.post("/api/v1/knowledge/documents", {
      title: data.title,
      content: data.content,
      tags: data.tags ? data.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
    }).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["knowledge-pages"] }); toast.success("Page created"); reset(); setOpen(false); },
    onError: () => toast.error("Failed to create page"),
  });

  const filtered = pages.filter((p) => p.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search pages..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Button size="sm" className="gap-2 ml-auto" onClick={() => setOpen(true)}><Plus className="h-4 w-4" />New Page</Button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>Create knowledge page</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit((d) => create.mutate(d))} className="space-y-4 mt-2">
              <div className="space-y-1">
                <Label>Title</Label>
                <Input placeholder="Page title" {...register("title")} />
                {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
              </div>
              <div className="space-y-1">
                <Label>Content</Label>
                <Textarea placeholder="Write your content here..." rows={10} className="font-mono text-sm" {...register("content")} />
                {errors.content && <p className="text-xs text-destructive">{errors.content.message}</p>}
              </div>
              <div className="space-y-1">
                <Label>Tags <span className="text-muted-foreground text-xs">(comma separated)</span></Label>
                <Input placeholder="api, backend, guide" {...register("tags")} />
              </div>
              <Button type="submit" className="w-full" disabled={create.isPending}>
                {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create Page
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <BookOpen className="h-12 w-12 text-muted-foreground/40" />
          <div><p className="font-medium">No pages yet</p><p className="text-sm text-muted-foreground">Create your first knowledge base page</p></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((page) => (
            <Link key={page.id} href={`/knowledge/${page.id}`}>
              <Card className="hover:border-primary/50 transition-all cursor-pointer group h-full">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold line-clamp-1 group-hover:text-primary transition-colors">{page.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground line-clamp-3 min-h-[3.75rem]">{page.content}</p>
                  <div className="flex flex-wrap gap-1">
                    {page.tags?.slice(0, 3).map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs gap-1">
                        <Tag className="h-2.5 w-2.5" />{tag}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">{new Date(page.created_at).toLocaleDateString()}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
