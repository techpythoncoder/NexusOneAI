"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { 
  Key, Plus, Trash2, Copy, Check, Terminal, Code2, 
  ExternalLink, ShieldCheck, Database, Zap, BookOpen 
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuthStore } from "@/store/auth-store";
import api from "@/lib/api";

interface APIKey {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  is_active: boolean;
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

const apiKeySchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(50),
  expires_days: z.number().optional(),
});

type APIKeyForm = z.infer<typeof apiKeySchema>;

export default function DeveloperPortalPage() {
  const { org } = useAuthStore();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeLang, setActiveLang] = useState<"curl" | "python" | "js">("curl");

  const { data: apiKeys = [], isLoading } = useQuery<APIKey[]>({
    queryKey: ["developer-api-keys"],
    queryFn: () => api.get("/api/v1/users/me/api-keys").then((r) => r.data),
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<APIKeyForm>({
    resolver: zodResolver(apiKeySchema),
  });

  const createKey = useMutation({
    mutationFn: (data: APIKeyForm) =>
      api.post("/api/v1/users/me/api-keys", {
        name: data.name,
        organization_id: org?.id,
        scopes: ["read", "write"],
      }).then((r) => r.data),
    onSuccess: (data) => {
      setNewKey(data.key);
      qc.invalidateQueries({ queryKey: ["developer-api-keys"] });
      reset();
      setShowCreate(false);
      toast.success("API key generated successfully");
    },
    onError: () => toast.error("Failed to generate API key"),
  });

  const revokeKey = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/users/me/api-keys/${id}`),
    onSuccess: () => { 
      qc.invalidateQueries({ queryKey: ["developer-api-keys"] }); 
      toast.success("API key revoked"); 
    },
    onError: () => toast.error("Failed to revoke key"),
  });

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getCodeSnippet = (endpoint: string, method: string, payload?: object) => {
    const baseUrl = window.location.origin;
    const tokenPlaceholder = newKey || "nxk_live_abc123yourkeyhere";

    if (activeLang === "curl") {
      const bodyParam = payload ? ` \\\n  -d '${JSON.stringify(payload)}'` : "";
      return `curl -X ${method} "${baseUrl}${endpoint}" \\\n  -H "Authorization: Bearer ${tokenPlaceholder}" \\\n  -H "Content-Type: application/json"${bodyParam}`;
    }

    if (activeLang === "python") {
      const dataParam = payload ? `, json=${JSON.stringify(payload)}` : "";
      return `import requests\n\nurl = "${baseUrl}${endpoint}"\nheaders = {{\n    "Authorization": "Bearer ${tokenPlaceholder}",\n    "Content-Type": "application/json"\n}}\n\nresponse = requests.${method.toLowerCase()}(url, headers=headers${dataParam})\nprint(response.json())`;
    }

    const bodyParam = payload ? `,\n  body: JSON.stringify(${JSON.stringify(payload)})` : "";
    return `fetch("${baseUrl}${endpoint}", {{\n  method: "${method}",\n  headers: {{\n    "Authorization": "Bearer ${tokenPlaceholder}",\n    "Content-Type": "application/json"\n  }}${bodyParam}\n}})\n.then(res => res.json())\n.then(data => console.log(data));`;
  };

  return (
    <div className="flex-1 p-6 space-y-6 overflow-y-auto">
      {/* Title */}
      <div className="flex flex-col gap-1 border-b pb-4">
        <h1 className="text-2xl font-bold tracking-tight">Developer Portal</h1>
        <p className="text-muted-foreground text-sm">
          Generate API keys and read integration guides to interact programmatically with your workspace.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: API Keys Management */}
        <div className="lg:col-span-1 space-y-6">
          {newKey && (
            <Card className="border-primary/40 bg-primary/5 shadow-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-primary flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4" /> Copy your API key
                </CardTitle>
                <CardDescription className="text-xs">
                  This secret key will not be shown again. Save it securely.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-background border rounded px-2.5 py-1.5 text-xs font-mono break-all select-all">
                    {newKey}
                  </code>
                  <Button size="sm" variant="outline" onClick={() => copyToClipboard(newKey)} className="shrink-0 h-8 gap-1 text-xs">
                    {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setNewKey(null)} className="h-7 text-xs">
                  Dismiss
                </Button>
              </CardContent>
            </Card>
          )}

          <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base">API Credentials</CardTitle>
                <CardDescription className="text-xs">Active authentication tokens.</CardDescription>
              </div>
              <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => setShowCreate(!showCreate)}>
                <Plus className="h-3.5 w-3.5" /> Generate Key
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {showCreate && (
                <form onSubmit={handleSubmit((d) => createKey.mutate(d))} className="space-y-3 border p-3 rounded-lg bg-muted/30">
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-muted-foreground">Key Name</label>
                    <Input 
                      placeholder="e.g., GitHub Action CI" 
                      className="h-8 text-xs"
                      {...register("name")}
                    />
                    {errors.name && <p className="text-[10px] text-destructive">{errors.name.message}</p>}
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowCreate(false)}>Cancel</Button>
                    <Button type="submit" size="sm" className="h-7 text-xs" disabled={createKey.isPending}>
                      {createKey.isPending ? "Generating..." : "Generate"}
                    </Button>
                  </div>
                </form>
              )}

              {isLoading ? (
                <div className="space-y-2">
                  {[1, 2].map((i) => (
                    <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />
                  ))}
                </div>
              ) : apiKeys.length === 0 ? (
                <div className="text-center py-6 border border-dashed rounded-lg text-muted-foreground">
                  <Key className="h-7 w-7 mx-auto mb-1.5 opacity-30" />
                  <p className="text-xs">No active keys. Create one to begin.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {apiKeys.map((k) => (
                    <div key={k.id} className="flex items-center justify-between p-2.5 border rounded-lg hover:bg-muted/10 transition-colors">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-xs text-foreground truncate">{k.name}</span>
                          <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono text-muted-foreground">
                            {k.key_prefix}***
                          </code>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          Created {new Date(k.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/15"
                        onClick={() => { if(confirm("Revoke this key?")) revokeKey.mutate(k.id); }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Code Snippets & Guides */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-3 border-b">
              <div className="space-y-1">
                <CardTitle className="text-base flex items-center gap-1.5">
                  <BookOpen className="h-4.5 w-4.5 text-primary" /> API Integration Guide
                </CardTitle>
                <CardDescription className="text-xs">
                  Copy code blocks directly to access workspace resources.
                </CardDescription>
              </div>

              {/* Language Selector */}
              <div className="flex items-center border rounded-lg p-0.5 bg-muted/40">
                <Button 
                  size="sm" 
                  variant={activeLang === "curl" ? "secondary" : "ghost"} 
                  className="h-7 text-xs px-2.5" 
                  onClick={() => setActiveLang("curl")}
                >
                  cURL
                </Button>
                <Button 
                  size="sm" 
                  variant={activeLang === "python" ? "secondary" : "ghost"} 
                  className="h-7 text-xs px-2.5" 
                  onClick={() => setActiveLang("python")}
                >
                  Python
                </Button>
                <Button 
                  size="sm" 
                  variant={activeLang === "js" ? "secondary" : "ghost"} 
                  className="h-7 text-xs px-2.5" 
                  onClick={() => setActiveLang("js")}
                >
                  JS/Fetch
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <Tabs defaultValue="projects" className="space-y-4">
                <TabsList className="grid w-full grid-cols-4 h-9">
                  <TabsTrigger value="projects" className="text-xs">Projects</TabsTrigger>
                  <TabsTrigger value="tasks" className="text-xs">Tasks</TabsTrigger>
                  <TabsTrigger value="workflows" className="text-xs">Workflows</TabsTrigger>
                  <TabsTrigger value="search" className="text-xs">Search</TabsTrigger>
                </TabsList>

                {/* Projects API */}
                <TabsContent value="projects" className="space-y-4">
                  <div className="space-y-2">
                    <h3 className="text-xs font-bold uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
                      <Terminal className="h-3.5 w-3.5" /> List Workspace Projects
                    </h3>
                    <pre className="relative overflow-x-auto rounded-lg border bg-muted p-4 font-mono text-[11px] leading-relaxed text-foreground whitespace-pre">
                      {getCodeSnippet("/api/v1/projects/", "GET")}
                    </pre>
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-xs font-bold uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
                      <Plus className="h-3.5 w-3.5" /> Create New Project
                    </h3>
                    <pre className="relative overflow-x-auto rounded-lg border bg-muted p-4 font-mono text-[11px] leading-relaxed text-foreground whitespace-pre">
                      {getCodeSnippet("/api/v1/projects/", "POST", { name: "Analytics Dashboard", key: "DASH", description: "Operations tracking board." })}
                    </pre>
                  </div>
                </TabsContent>

                {/* Tasks API */}
                <TabsContent value="tasks" className="space-y-4">
                  <div className="space-y-2">
                    <h3 className="text-xs font-bold uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
                      <Terminal className="h-3.5 w-3.5" /> Create a Project Task
                    </h3>
                    <pre className="relative overflow-x-auto rounded-lg border bg-muted p-4 font-mono text-[11px] leading-relaxed text-foreground whitespace-pre">
                      {getCodeSnippet("/api/v1/projects/tasks", "POST", { title: "Integrate OpenTelemetry tracing", description: "Link Jaeger exporter route.", project_id: "your-project-uuid" })}
                    </pre>
                  </div>
                </TabsContent>

                {/* Workflows API */}
                <TabsContent value="workflows" className="space-y-4">
                  <div className="space-y-2">
                    <h3 className="text-xs font-bold uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
                      <Zap className="h-3.5 w-3.5" /> Trigger Automation Run
                    </h3>
                    <pre className="relative overflow-x-auto rounded-lg border bg-muted p-4 font-mono text-[11px] leading-relaxed text-foreground whitespace-pre">
                      {getCodeSnippet("/api/v1/workflows/your-workflow-uuid/trigger", "POST", { build_status: "SUCCESS" })}
                    </pre>
                  </div>
                </TabsContent>

                {/* Search API */}
                <TabsContent value="search" className="space-y-4">
                  <div className="space-y-2">
                    <h3 className="text-xs font-bold uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
                      <Code2 className="h-3.5 w-3.5" /> Global Hybrid/Semantic Search
                    </h3>
                    <pre className="relative overflow-x-auto rounded-lg border bg-muted p-4 font-mono text-[11px] leading-relaxed text-foreground whitespace-pre">
                      {getCodeSnippet("/api/v1/search?q=open+telemetry", "GET")}
                    </pre>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
