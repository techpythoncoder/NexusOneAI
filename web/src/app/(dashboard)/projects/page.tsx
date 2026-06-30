"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, FolderKanban, Loader2, ArrowRight } from "lucide-react";
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
import { Project } from "@/types";

const schema = z.object({
  name: z.string().min(1, "Name required"),
  key: z.string()
    .min(1, "Key required")
    .max(10, "Max 10 characters")
    .regex(/^[A-Z0-9]+$/, "Only uppercase letters and numbers"),
  description: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

const STATUS_COLOR: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  archived: "bg-muted text-muted-foreground",
  completed: "bg-blue-500/10 text-blue-500 border-blue-500/20",
};

export default function ProjectsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: () => api.get("/api/v1/projects").then((r) => r.data),
  });

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<FormData>({ resolver: zodResolver(schema) });

  const create = useMutation({
    mutationFn: (data: FormData) => api.post("/api/v1/projects", data).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["projects"] }); toast.success("Project created"); reset(); setOpen(false); },
    onError: () => toast.error("Failed to create project"),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">{projects.length} project{projects.length !== 1 ? "s" : ""}</p>
        <Button size="sm" className="gap-2" onClick={() => setOpen(true)}><Plus className="h-4 w-4" />New Project</Button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Create project</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit((d) => create.mutate(d))} className="space-y-4 mt-2">
              <div className="space-y-1">
                <Label>Name</Label>
                <Input 
                  placeholder="My awesome project" 
                  {...register("name")} 
                  onChange={(e) => {
                    register("name").onChange(e);
                    const val = e.target.value;
                    const suggested = val.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 5);
                    setValue("key", suggested);
                  }}
                />
                {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
              </div>
              <div className="space-y-1">
                <Label>Key</Label>
                <Input placeholder="e.g. MYPROJ" {...register("key")} />
                {errors.key && <p className="text-xs text-destructive">{errors.key.message}</p>}
              </div>
              <div className="space-y-1">
                <Label>Description</Label>
                <Textarea placeholder="What is this project about?" {...register("description")} />
              </div>
              <Button type="submit" className="w-full" disabled={create.isPending}>
                {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <FolderKanban className="h-12 w-12 text-muted-foreground/40" />
          <div><p className="font-medium">No projects yet</p><p className="text-sm text-muted-foreground">Create your first project to get started</p></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {projects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`}>
              <Card className="hover:border-primary/50 transition-all cursor-pointer group h-full">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base font-semibold line-clamp-1 group-hover:text-primary transition-colors">{p.name}</CardTitle>
                    <Badge className={STATUS_COLOR[p.status] ?? ""} variant="outline">{p.status}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground line-clamp-2 min-h-[2.5rem]">{p.description || "No description"}</p>
                  <div className="flex items-center justify-between mt-4 text-xs text-muted-foreground">
                    <span>{new Date(p.created_at).toLocaleDateString()}</span>
                    <ArrowRight className="h-3.5 w-3.5 group-hover:text-primary transition-colors" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
