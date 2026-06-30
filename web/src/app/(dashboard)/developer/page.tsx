"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { 
  Key, Plus, Trash2, Copy, Check, Terminal, Code2, 
  ExternalLink, ShieldCheck, Database, Zap, BookOpen,
  Lock, RefreshCw, AlertTriangle, Activity, Settings, Info
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
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [activeLang, setActiveLang] = useState<"curl" | "python" | "js">("curl");
  const [activeSection, setActiveSection] = useState<"getting-started" | "api-keys" | "reference">("getting-started");

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

  const copyToClipboard = async (text: string, type: string) => {
    await navigator.clipboard.writeText(text);
    if (type === "key") {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      setCopiedCode(type);
      setTimeout(() => setCopiedCode(null), 2000);
    }
    toast.success("Copied to clipboard");
  };

  const getCodeSnippet = (endpoint: string, method: string, payload?: object) => {
    const baseUrl = window.location.origin;
    const tokenPlaceholder = newKey || "nx_live_abc123yourkeyhere";

    if (activeLang === "curl") {
      const bodyParam = payload ? ` \\\n  -d '${JSON.stringify(payload, null, 2)}'` : "";
      return `curl -X ${method} "${baseUrl}${endpoint}" \\\n  -H "Authorization: Bearer ${tokenPlaceholder}" \\\n  -H "Content-Type: application/json"${bodyParam}`;
    }

    if (activeLang === "python") {
      const dataParam = payload ? `, json=${JSON.stringify(payload, null, 4)}` : "";
      return `import requests\n\nurl = "${baseUrl}${endpoint}"\nheaders = {\n    "Authorization": "Bearer ${tokenPlaceholder}",\n    "Content-Type": "application/json"\n}\n\nresponse = requests.${method.toLowerCase()}(url, headers=headers${dataParam})\nprint(response.json())`;
    }

    const bodyParam = payload ? `,\n  body: JSON.stringify(${JSON.stringify(payload, null, 2)})` : "";
    return `fetch("${baseUrl}${endpoint}", {\n  method: "${method}",\n  headers: {\n    "Authorization": "Bearer ${tokenPlaceholder}",\n    "Content-Type": "application/json"\n  }${bodyParam}\n})\n.then(res => res.json())\n.then(data => console.log(data));`;
  };

  return (
    <div className="flex-1 flex overflow-hidden bg-background">
      {/* Docs navigation panel */}
      <aside className="w-64 border-r bg-muted/10 flex flex-col shrink-0">
        <div className="p-4 border-b">
          <div className="flex items-center gap-2">
            <div className="bg-primary/10 p-1.5 rounded-lg text-primary">
              <Code2 className="h-5 w-5" />
            </div>
            <div>
              <span className="font-bold text-sm">Developer Hub</span>
              <p className="text-[10px] text-muted-foreground">Version v1.0.0</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1.5">
          <Button 
            variant={activeSection === "getting-started" ? "secondary" : "ghost"}
            className="w-full justify-start gap-2 text-xs h-9"
            onClick={() => setActiveSection("getting-started")}
          >
            <BookOpen className="h-4 w-4 shrink-0" />
            Getting Started
          </Button>

          <Button 
            variant={activeSection === "api-keys" ? "secondary" : "ghost"}
            className="w-full justify-start gap-2 text-xs h-9"
            onClick={() => setActiveSection("api-keys")}
          >
            <Key className="h-4 w-4 shrink-0" />
            API Keys & Auth
          </Button>

          <div className="pt-4 pb-1">
            <span className="px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">API Reference</span>
          </div>

          <Button 
            variant={activeSection === "reference" ? "secondary" : "ghost"}
            className="w-full justify-start gap-2 text-xs h-9"
            onClick={() => setActiveSection("reference")}
          >
            <Database className="h-4 w-4 shrink-0" />
            Workspace Endpoints
          </Button>
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-8 space-y-8 max-w-5xl">
        
        {/* Banner Header */}
        <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-r from-primary/10 via-background to-muted p-6 shadow-sm">
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-1 bg-primary/15 text-primary text-[10px] px-2 py-0.5 rounded-full font-semibold">
                <Activity className="h-3 w-3" /> Live Sandbox
              </div>
              <h2 className="text-xl font-bold tracking-tight">NexusOne API Developer Portal</h2>
              <p className="text-muted-foreground text-xs max-w-xl">
                Build workflows, integrate scripts, and authenticate secure service pipelines. 
                Use your custom organization ID: <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-[11px] text-foreground font-bold">{org?.id || "default"}</code>
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => window.open("/docs", "_blank")}>
                Swagger docs <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <div className="absolute right-0 top-0 -mr-16 -mt-16 w-48 h-48 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
        </div>

        {/* SECTION: Getting Started */}
        {activeSection === "getting-started" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-card/50">
                <CardHeader className="pb-2">
                  <div className="bg-emerald-500/10 text-emerald-600 p-2 rounded-lg w-fit mb-2">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-sm">Secure Authentication</CardTitle>
                  <CardDescription className="text-xs">
                    HTTP Bearer Token auth with automated audit-logging.
                  </CardDescription>
                </CardHeader>
              </Card>

              <Card className="bg-card/50">
                <CardHeader className="pb-2">
                  <div className="bg-indigo-500/10 text-indigo-600 p-2 rounded-lg w-fit mb-2">
                    <Activity className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-sm">Rate Limiting</CardTitle>
                  <CardDescription className="text-xs">
                    Up to 100 requests per minute with retry headers.
                  </CardDescription>
                </CardHeader>
              </Card>

              <Card className="bg-card/50">
                <CardHeader className="pb-2">
                  <div className="bg-amber-500/10 text-amber-600 p-2 rounded-lg w-fit mb-2">
                    <Zap className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-sm">Real-time Webhooks</CardTitle>
                  <CardDescription className="text-xs">
                    HTTP callback triggers on resource state changes.
                  </CardDescription>
                </CardHeader>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Quick Start Guide</CardTitle>
                <CardDescription className="text-xs">How program authentication works under the hood.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-xs leading-relaxed text-muted-foreground">
                <p>
                  All program actions are executed securely inside your active organization context.
                  Unlike standard browser sessions that rely on transient cookies or short-lived JWT tokens, 
                  scripts authenticate using **Developer API Keys** passed in the standard header format:
                </p>
                <pre className="bg-muted p-3.5 rounded-lg border font-mono text-[11px] text-foreground">
                  Authorization: Bearer nx_live_YOUR_API_KEY
                </pre>
                <div className="flex gap-2.5 items-start bg-amber-500/5 border border-amber-500/20 p-3 rounded-lg text-amber-600">
                  <Info className="h-4 w-4 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-semibold text-foreground">Important Prefix Rule:</p>
                    <p>All production keys begin with the <code className="bg-amber-500/10 px-1 py-0.5 rounded font-mono">nx_</code> prefix. The gateway checks this prefix to decide whether to query the database or use signature authentication. Do not alter this prefix.</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Scopes Table */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Permission Scopes</CardTitle>
                <CardDescription className="text-xs">Configure granular access limitations for your API keys.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border rounded-lg overflow-hidden text-xs">
                  <div className="grid grid-cols-3 bg-muted/50 p-2.5 font-semibold border-b text-foreground">
                    <span>Scope Name</span>
                    <span className="col-span-2">Access Capabilities</span>
                  </div>
                  <div className="divide-y">
                    <div className="grid grid-cols-3 p-2.5">
                      <code className="text-primary font-mono font-bold">projects:read</code>
                      <span className="col-span-2">Allows querying, listing, and retrieving details of workspace projects.</span>
                    </div>
                    <div className="grid grid-cols-3 p-2.5">
                      <code className="text-primary font-mono font-bold">projects:write</code>
                      <span className="col-span-2">Allows creating, updating, and archiving workspace projects.</span>
                    </div>
                    <div className="grid grid-cols-3 p-2.5">
                      <code className="text-primary font-mono font-bold">tasks:write</code>
                      <span className="col-span-2">Allows modifying task lists, updating progress columns, and assigning members.</span>
                    </div>
                    <div className="grid grid-cols-3 p-2.5">
                      <code className="text-primary font-mono font-bold">workflows:trigger</code>
                      <span className="col-span-2">Allows programmatically executing workflows and pipeline triggers.</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* SECTION: API Keys */}
        {activeSection === "api-keys" && (
          <div className="space-y-6">
            {newKey && (
              <Card className="border-emerald-500/40 bg-emerald-500/5 shadow-md">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-emerald-600 flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4" /> Secret Key Created Successfully
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Please copy this key now. It will not be shown again for security reasons.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-background border rounded px-3 py-2 text-xs font-mono break-all select-all">
                      {newKey}
                    </code>
                    <Button size="sm" variant="outline" onClick={() => copyToClipboard(newKey, "key")} className="shrink-0 h-9 gap-1.5 text-xs">
                      {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                      {copied ? "Copied" : "Copy Key"}
                    </Button>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setNewKey(null)} className="h-7 text-xs">
                    Dismiss Notice
                  </Button>
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="md:col-span-2">
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                  <div>
                    <CardTitle className="text-base">Active Credentials</CardTitle>
                    <CardDescription className="text-xs">Revoke or generate API keys for your applications.</CardDescription>
                  </div>
                  <Button size="sm" className="h-8 gap-1 text-xs" onClick={() => setShowCreate(!showCreate)}>
                    <Plus className="h-3.5 w-3.5" /> New Key
                  </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  {showCreate && (
                    <form onSubmit={handleSubmit((d) => createKey.mutate(d))} className="space-y-4 border p-4 rounded-xl bg-muted/20">
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-semibold text-foreground">Key Description Name</label>
                        <Input 
                          placeholder="e.g., Jenkins Pipeline Deployer" 
                          className="h-9 text-xs"
                          {...register("name")}
                        />
                        {errors.name && <p className="text-[10px] text-destructive">{errors.name.message}</p>}
                      </div>
                      <div className="flex justify-end gap-2 pt-1">
                        <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setShowCreate(false)}>Cancel</Button>
                        <Button type="submit" size="sm" className="h-8 text-xs" disabled={createKey.isPending}>
                          {createKey.isPending ? "Generating..." : "Generate API Key"}
                        </Button>
                      </div>
                    </form>
                  )}

                  {isLoading ? (
                    <div className="space-y-2">
                      {[1, 2].map((i) => (
                        <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
                      ))}
                    </div>
                  ) : apiKeys.length === 0 ? (
                    <div className="text-center py-10 border border-dashed rounded-xl text-muted-foreground">
                      <Key className="h-8 w-8 mx-auto mb-2 opacity-35 text-primary" />
                      <p className="text-xs">No active keys. Generate a key above to start building.</p>
                    </div>
                  ) : (
                    <div className="divide-y">
                      {apiKeys.map((k) => (
                        <div key={k.id} className="flex items-center justify-between py-3 gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-xs text-foreground truncate">{k.name}</span>
                              <code className="text-[10px] bg-muted px-2 py-0.5 rounded font-mono text-muted-foreground">
                                {k.key_prefix}***
                              </code>
                            </div>
                            <div className="flex items-center gap-4 text-[10px] text-muted-foreground mt-1">
                              <span>Created: {new Date(k.created_at).toLocaleDateString()}</span>
                              {k.last_used_at ? (
                                <span>Last used: {new Date(k.last_used_at).toLocaleDateString()}</span>
                              ) : (
                                <span>Never used</span>
                              )}
                            </div>
                          </div>
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/15"
                            onClick={() => { if(confirm("Are you sure you want to revoke this API key? This cannot be undone.")) revokeKey.mutate(k.id); }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Rate limit status card */}
              <div className="space-y-6">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Rate Limit Health</CardTitle>
                    <CardDescription className="text-[11px]">Usage capacity metrics per API key.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] font-semibold text-muted-foreground">
                        <span>Remaining Requests</span>
                        <span>100 / 100</span>
                      </div>
                      <div className="w-full bg-muted h-1.5 rounded-full overflow-hidden">
                        <div className="bg-primary h-full w-full" />
                      </div>
                    </div>
                    <div className="flex items-start gap-2 text-[10px] text-muted-foreground bg-muted/30 p-2.5 rounded-lg">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                      <span>If you breach this limit, you will receive an HTTP 429 Too Many Requests response.</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        )}

        {/* SECTION: API Reference */}
        {activeSection === "reference" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-base font-semibold">Workspace Endpoint Reference</h3>
              
              {/* Language Switcher */}
              <div className="flex items-center border rounded-lg p-0.5 bg-muted/40 shrink-0">
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
                  JS / Fetch
                </Button>
              </div>
            </div>

            {/* List of Endpoints */}
            <div className="space-y-8">
              
              {/* ENDPOINT 1: List Projects */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-6 border-b">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="bg-emerald-500/10 text-emerald-600 text-[10px] font-bold px-2 py-0.5 rounded uppercase">GET</span>
                    <code className="text-xs font-mono font-bold text-foreground">/api/v1/projects/</code>
                  </div>
                  <h4 className="font-semibold text-sm">List Workspace Projects</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Retrieve a list of all active projects within your organization context. Results are automatically scoped to your tenant.
                  </p>
                  
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Required Header:</span>
                    <pre className="bg-muted px-2 py-1.5 border rounded font-mono text-[10px] text-foreground">
                      Authorization: Bearer nx_live_...
                    </pre>
                  </div>
                </div>

                <div className="space-y-2 relative">
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    className="absolute top-2 right-2 h-7 w-7 bg-background/50 hover:bg-background"
                    onClick={() => copyToClipboard(getCodeSnippet("/api/v1/projects/", "GET"), "list-projects")}
                  >
                    {copiedCode === "list-projects" ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                  <pre className="overflow-x-auto rounded-lg border bg-muted p-4 font-mono text-[10px] leading-relaxed text-foreground whitespace-pre-wrap max-h-60">
                    {getCodeSnippet("/api/v1/projects/", "GET")}
                  </pre>
                </div>
              </div>

              {/* ENDPOINT 2: Create Project */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-6 border-b">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="bg-indigo-500/10 text-indigo-600 text-[10px] font-bold px-2 py-0.5 rounded uppercase">POST</span>
                    <code className="text-xs font-mono font-bold text-foreground">/api/v1/projects/</code>
                  </div>
                  <h4 className="font-semibold text-sm">Create a Project</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Initialize a new project inside the workspace. The payload requires a unique key prefix for task routing.
                  </p>
                  
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Body parameters:</span>
                    <ul className="text-xs space-y-1 list-disc pl-4 text-muted-foreground">
                      <li><code className="text-foreground font-mono">name</code> (string, required) - Project title</li>
                      <li><code className="text-foreground font-mono">key</code> (string, required) - Task shorthand prefix</li>
                      <li><code className="text-foreground font-mono">description</code> (string, optional) - Project summary</li>
                    </ul>
                  </div>
                </div>

                <div className="space-y-2 relative">
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    className="absolute top-2 right-2 h-7 w-7 bg-background/50 hover:bg-background"
                    onClick={() => copyToClipboard(getCodeSnippet("/api/v1/projects/", "POST", { name: "Sales CRM Integration", key: "CRM", description: "Automated leads mapping board." }), "create-project")}
                  >
                    {copiedCode === "create-project" ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                  <pre className="overflow-x-auto rounded-lg border bg-muted p-4 font-mono text-[10px] leading-relaxed text-foreground whitespace-pre-wrap max-h-60">
                    {getCodeSnippet("/api/v1/projects/", "POST", { name: "Sales CRM Integration", key: "CRM", description: "Automated leads mapping board." })}
                  </pre>
                </div>
              </div>

              {/* ENDPOINT 3: Create Task */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-6 border-b">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="bg-indigo-500/10 text-indigo-600 text-[10px] font-bold px-2 py-0.5 rounded uppercase">POST</span>
                    <code className="text-xs font-mono font-bold text-foreground">/api/v1/projects/tasks</code>
                  </div>
                  <h4 className="font-semibold text-sm">Create a Task</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Create a new task associated with a specific project context.
                  </p>
                  
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Body parameters:</span>
                    <ul className="text-xs space-y-1 list-disc pl-4 text-muted-foreground">
                      <li><code className="text-foreground font-mono">title</code> (string, required) - Task title</li>
                      <li><code className="text-foreground font-mono">project_id</code> (string, required) - Project UUID</li>
                      <li><code className="text-foreground font-mono">description</code> (string, optional) - Detailed specification</li>
                    </ul>
                  </div>
                </div>

                <div className="space-y-2 relative">
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    className="absolute top-2 right-2 h-7 w-7 bg-background/50 hover:bg-background"
                    onClick={() => copyToClipboard(getCodeSnippet("/api/v1/projects/tasks", "POST", { title: "Draft API key security policy", project_id: "e44d32a9-c8f0-4e3f-a392-5b90f4a24c55" }), "create-task")}
                  >
                    {copiedCode === "create-task" ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                  <pre className="overflow-x-auto rounded-lg border bg-muted p-4 font-mono text-[10px] leading-relaxed text-foreground whitespace-pre-wrap max-h-60">
                    {getCodeSnippet("/api/v1/projects/tasks", "POST", { title: "Draft API key security policy", project_id: "e44d32a9-c8f0-4e3f-a392-5b90f4a24c55" })}
                  </pre>
                </div>
              </div>

              {/* ENDPOINT 4: Trigger Workflow */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="bg-indigo-500/10 text-indigo-600 text-[10px] font-bold px-2 py-0.5 rounded uppercase">POST</span>
                    <code className="text-xs font-mono font-bold text-foreground">/api/v1/workflows/{"{id}"}/trigger</code>
                  </div>
                  <h4 className="font-semibold text-sm">Trigger Automation Workflow</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Programmatically execute a predefined workflow. You can pass arbitrary webhook payload parameters that are referenced in action templates.
                  </p>
                </div>

                <div className="space-y-2 relative">
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    className="absolute top-2 right-2 h-7 w-7 bg-background/50 hover:bg-background"
                    onClick={() => copyToClipboard(getCodeSnippet("/api/v1/workflows/5f72da0c-43bc-42f1-9d19-4822ab1a0f8b/trigger", "POST", { build_status: "PASSED", git_author: "techpythoncoder" }), "trigger-workflow")}
                  >
                    {copiedCode === "trigger-workflow" ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                  <pre className="overflow-x-auto rounded-lg border bg-muted p-4 font-mono text-[10px] leading-relaxed text-foreground whitespace-pre-wrap max-h-60">
                    {getCodeSnippet("/api/v1/workflows/5f72da0c-43bc-42f1-9d19-4822ab1a0f8b/trigger", "POST", { build_status: "PASSED", git_author: "techpythoncoder" })}
                  </pre>
                </div>
              </div>

            </div>
          </div>
        )}

      </main>
    </div>
  );
}
