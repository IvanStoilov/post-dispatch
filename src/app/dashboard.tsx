"use client";
import { platforms, channelLabels } from "@/lib/connectors/catalog";
import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import ProjectSettings from "./project-settings";
import AssistantSettings from "./assistant-settings";
import DraftEditor, { type Draft, type MediaItem } from "./draft-editor";
import { PostCard } from "@/components/post-card";
import { Brand } from "@/components/brand";
import { FlowPanel } from "@/components/flow-panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
} from "@/components/ui/input-group";
import { Alert, AlertDescription, AlertAction } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuBadge,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Inbox,
  Send,
  Plug,
  Code2,
  Plus,
  Search,
  X,
  LogOut,
  ShieldCheck,
  Check,
  Trash2,
} from "lucide-react";
import type { Post, Platform, Project } from "@/lib/types";
type View = "Inbox" | "Published" | "Connections" | "MCP integration";
const blank: Draft = {
  title: "",
  caption: "",
  imageUrl: "",
  platforms: ["facebook"],
  source: "Manual",
};
const navigation = [
  { view: "Inbox" as View, icon: Inbox },
  { view: "Published" as View, icon: Send },
  { view: "Connections" as View, icon: Plug },
  { view: "MCP integration" as View, icon: Code2 },
];
function WorkspaceNavigation({
  view,
  projectId,
  drafts,
  published,
  onNavigate,
}: {
  view: View;
  projectId: string;
  drafts: number;
  published: number;
  onNavigate: (view: View) => void;
}) {
  const { setOpenMobile } = useSidebar();
  return (
    <SidebarMenu>
      {navigation.map(({ view: name, icon: Icon }) => (
        <SidebarMenuItem key={name} isActive={view === name}>
          <SidebarMenuButton asChild isActive={view === name} size="lg">
            <Link
              aria-current={view === name ? "page" : undefined}
              href={`/?${new URLSearchParams({ view: name, projectId })}`}
              onClick={(event) => {
                if (
                  event.metaKey ||
                  event.ctrlKey ||
                  event.shiftKey ||
                  event.altKey
                )
                  return;
                event.preventDefault();
                onNavigate(name);
                setOpenMobile(false);
              }}
            >
              <Icon aria-hidden="true" />
              <span>{name}</span>
            </Link>
          </SidebarMenuButton>
          {(name === "Inbox" || name === "Published") && (
            <SidebarMenuBadge>
              {name === "Inbox" ? drafts : published}
            </SidebarMenuBadge>
          )}
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}
export default function Dashboard({
  user,
}: {
  user: { name: string; email: string };
}) {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);
  const [mcpToken, setMcpToken] = useState("");
  const [oauthConnections, setOAuthConnections] = useState<
    { clientId: string; name: string; scopes: string[] }[]
  >([]);
  const requestSequence = useRef(0);
  const project = projects.find((p) => p.id === projectId);
  const [posts, setPosts] = useState<Post[]>([]);
  const [view, setView] = useState<View>("Inbox");
  useEffect(() => {
    const timer = setTimeout(() => {
      const query = new URLSearchParams(window.location.search);
      const requested = query.get("view") as View;
      if (query.has("connection")) setView("Connections");
      else if (navigation.some((item) => item.view === requested))
        setView(requested);
      if (["all", ...platforms].includes(query.get("channel") || ""))
        setFilter(query.get("channel")!);
      setSearch(query.get("search") || "");
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [connections, setConnections] = useState({
    facebook: false,
    instagram: false,
    linkedin: false,
    mcp: false,
  });
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Draft>(blank);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [initialDraft, setInitialDraft] = useState("");

  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState<Post | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Post | null>(null);
  const [origin, setOrigin] = useState("");
  const refresh = useCallback(
    async (preferred = projectId) => {
      const sequence = ++requestSequence.current;
      try {
        const response = await fetch("/api/projects", { cache: "no-store" });
        if (response.status === 401) {
          router.replace("/signin");
          router.refresh();
          return;
        }
        if (!response.ok) throw new Error("Could not load projects");
        const all: Project[] = await response.json();
        const requested =
          preferred ||
          new URLSearchParams(window.location.search).get("projectId") ||
          localStorage.getItem("postdispatch-project");
        const selected = all.find((p) => p.id === requested) || all[0];
        if (!selected) throw new Error("Create a project to begin");
        const [p, c, o] = await Promise.all([
          fetch(`/api/posts?projectId=${selected.id}`, { cache: "no-store" }),
          fetch(`/api/connections?projectId=${selected.id}`),
          fetch(`/api/projects/${selected.id}/oauth`, { cache: "no-store" }),
        ]);
        if (!p.ok || !c.ok || !o.ok)
          throw new Error("Could not load project workspace");
        const [data, config, grants] = await Promise.all([
          p.json(),
          c.json(),
          o.json(),
        ]);
        if (sequence !== requestSequence.current) return;
        setProjects(all);
        setProjectId(selected.id);
        localStorage.setItem("postdispatch-project", selected.id);
        setOrigin(window.location.origin);
        setPosts(data);
        setConnections(config);
        setOAuthConnections(grants);
      } catch (e) {
        if (sequence === requestSequence.current)
          setNotice(e instanceof Error ? e.message : "Could not load project");
      } finally {
        if (sequence === requestSequence.current) setLoading(false);
      }
    },
    [projectId, router],
  );
  useEffect(() => {
    const initial = setTimeout(() => void refresh(projectId), 0);
    const timer = setInterval(() => void refresh(projectId), 15000);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [projectId, refresh]);
  const switchProject = useCallback((id: string) => {
    ++requestSequence.current;
    setProjectId(id);
    setPosts([]);
    setNotice("");
    setMcpToken("");
    setOAuthConnections([]);
    setCreatingProject(false);
    setLoading(true);
  }, []);
  async function rotateMcpToken() {
    setBusy(true);
    try {
      const result = await request(`/api/projects/${projectId}/token`, "POST");
      setMcpToken(result.mcpToken);
      await refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not generate token");
    } finally {
      setBusy(false);
    }
  }
  async function request(url: string, method: string, body?: unknown) {
    const response = await fetch(
      url.startsWith("/api/posts") ? `${url}?projectId=${projectId}` : url,
      {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      },
    );
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Request failed");
    return result;
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const assets: Record<string, unknown>[] = [];
      const urls = form.imageUrl.split(/\s+/).filter(Boolean);
      if (mediaItems.length + urls.length > 10)
        throw new Error("Choose up to 10 images or one video");
      for (const item of mediaItems) {
        if (item.asset) {
          assets.push({ type: "EXISTING", assetId: item.asset.id });
          continue;
        }
        if (item.uploadId) {
          assets.push({ type: "UPLOAD_ID", uploadId: item.uploadId });
          continue;
        }
        if (!item.file) continue;
        setNotice(`Uploading ${item.file.name}…`);
        const path = `/api/assets/uploads?projectId=${projectId}`;
        const mimeType =
          item.file.type ||
          (item.file.name.toLowerCase().endsWith(".mp4") ? "video/mp4" : "");
        const start = await request(path, "POST", {
          mimeType,
          fileSize: item.file.size,
        });
        let uploaded: Response;
        try {
          uploaded = await fetch(start.uploadUrl, {
            method: "PUT",
            headers: start.headers,
            body: item.file,
          });
        } catch {
          throw new Error(
            "Could not upload to storage. Check the bucket's CORS configuration for this app's origin.",
          );
        }
        if (!uploaded.ok) throw new Error("Storage rejected the file upload");
        const ready = await request(path, "PATCH", {
          uploadId: start.uploadId,
        });
        assets.push({ type: "UPLOAD_ID", uploadId: ready.assetUploadId });
        // Preserve completed uploads across a failed draft save or a retry.
        setMediaItems((items) =>
          items.map((value) =>
            value.id === item.id
              ? { ...value, uploadId: ready.assetUploadId }
              : value,
          ),
        );
      }
      for (const url of urls) assets.push({ type: "EXTERNAL_URL", url });
      await request(
        editing === "new" ? "/api/posts" : `/api/posts/${editing}`,
        editing === "new" ? "POST" : "PATCH",
        {
          title: form.title,
          caption: form.caption,
          platforms: form.platforms,
          source: form.source,
          assets,
        },
      );
      setEditing(null);
      setNotice("Draft saved. Ready when you are.");
      await refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }
  async function publish() {
    if (!confirm) return;
    setBusy(true);
    const p = confirm;
    setConfirm(null);
    try {
      setNotice(
        p.assets[0]?.kind === "VIDEO"
          ? "Publishing video… Instagram processing may take a few minutes."
          : "Publishing…",
      );
      await request(`/api/posts/${p.id}/publish`, "POST");
      setNotice("Published successfully.");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Publishing failed");
    } finally {
      await refresh();
      setBusy(false);
    }
  }
  async function remove(id: string) {
    setBusy(true);
    try {
      await request(`/api/posts/${id}`, "DELETE");
      setEditing(null);
      setDeleteConfirm(null);
      await refresh();
      setNotice("Post deleted.");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }
  const drafts = posts.filter((p) => p.status !== "published");
  const published = posts.filter((p) => p.status === "published");
  const visible = (view === "Published" ? published : drafts).filter(
    (p) =>
      (filter === "all" || p.platforms.includes(filter as Platform)) &&
      `${p.title} ${p.caption} ${p.source}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  function newDraft() {
    setNotice("");
    setMediaItems([]);
    const draft: Draft = { ...blank, platforms: ["facebook"] };
    setForm(draft);
    setInitialDraft(JSON.stringify({ form: draft, assets: [] }));
    setEditing("new");
  }
  function edit(p: Post) {
    setNotice("");
    setMediaItems(p.assets.map((asset) => ({ id: asset.id, asset })));
    const draft: Draft = {
      title: p.title,
      caption: p.caption,
      imageUrl: "",
      platforms: p.platforms,
      source: p.source,
    };
    setForm(draft);
    setInitialDraft(
      JSON.stringify({
        form: draft,
        assets: p.assets.map((asset) => asset.id),
      }),
    );
    setEditing(p.id);
  }
  function navigate(next: View, id = projectId) {
    setView(next);
    setSearch("");
    setFilter("all");
    const query = new URLSearchParams({ view: next, projectId: id });
    window.history.pushState(null, "", `/?${query}`);
  }
  useEffect(() => {
    function restoreView() {
      const query = new URLSearchParams(window.location.search);
      const value = query.get("view") as View;
      setView(navigation.some((item) => item.view === value) ? value : "Inbox");
      setSearch(query.get("search") || "");
      setFilter(
        platforms.some((p) => p === query.get("channel"))
          ? query.get("channel")!
          : "all",
      );
      const id = query.get("projectId");
      if (id && id !== projectId) switchProject(id);
    }
    window.addEventListener("popstate", restoreView);
    return () => window.removeEventListener("popstate", restoreView);
  }, [projectId, switchProject]);
  function updateFilter(value: string) {
    setFilter(value);
    const query = new URLSearchParams(window.location.search);
    query.set("channel", value);
    window.history.replaceState(null, "", `/?${query}`);
  }
  function updateSearch(value: string) {
    setSearch(value);
    const query = new URLSearchParams(window.location.search);
    if (value) query.set("search", value);
    else query.delete("search");
    window.history.replaceState(null, "", `/?${query}`);
  }
  async function revoke(clientId: string) {
    setBusy(true);
    try {
      await request(
        `/api/projects/${projectId}/oauth?clientId=${encodeURIComponent(clientId)}`,
        "DELETE",
      );
      await refresh();
      setNotice("Assistant disconnected. Project bearer tokens remain active.");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Unable to disconnect",
      );
    } finally {
      setBusy(false);
    }
  }
  const inbox = view === "Inbox" || view === "Published";
  const headings: Record<View, [string, string]> = {
    Inbox: ["Draft inbox", "Review the ideas. Make the final call."],
    Published: ["Published posts", "The posts you’ve approved and shared."],
    Connections: [
      "Projects & channels",
      "Choose where this project’s posts go live.",
    ],
    "MCP integration": [
      "Connect your assistant",
      "Bring drafts from your conversations into this project.",
    ],
  };
  return (
    <SidebarProvider>
      <a
        href="#main-content"
        className="sr-only fixed top-4 left-4 rounded-lg bg-card p-3 focus:not-sr-only focus:z-50"
      >
        Skip to content
      </a>
      <Sidebar>
        <SidebarHeader className="gap-6 px-5 pt-7 pb-5">
          <Brand />
          <div className="flex flex-col gap-2">
            <label
              htmlFor="active-project"
              className="text-xs font-medium text-muted-foreground"
            >
              Your project
            </label>
            <Select
              value={projectId}
              disabled={
                busy || !!editing || !!confirm || !!deleteConfirm || loading
              }
              onValueChange={(id) => {
                switchProject(id);
                const query = new URLSearchParams(window.location.search);
                query.set("projectId", id);
                window.history.replaceState(null, "", `/?${query}`);
              }}
            >
              <SelectTrigger
                id="active-project"
                aria-label="Active project"
                className="w-full"
              >
                <SelectValue placeholder="Loading projects…" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {projects.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy || loading}
              onClick={() => {
                navigate("Connections");
                setCreatingProject(true);
              }}
              className="justify-start"
            >
              <Plus data-icon="inline-start" aria-hidden="true" />
              New project
            </Button>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup className="px-3">
            <SidebarGroupLabel>Publishing workspace</SidebarGroupLabel>
            <SidebarGroupContent>
              <nav aria-label="Workspace">
                <WorkspaceNavigation
                  view={view}
                  projectId={projectId}
                  drafts={drafts.length}
                  published={published.length}
                  onNavigate={navigate}
                />
              </nav>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="gap-5 px-5 pb-5">
          <nav
            aria-label="Help and legal"
            className="flex flex-wrap gap-x-4 gap-y-2 text-xs"
          >
            <Link className="public-link" href="/guide">
              Setup guide
            </Link>
            <Link className="public-link" href="/support">
              Support
            </Link>
            <Link className="public-link" href="/privacy">
              Privacy
            </Link>
            <Link className="public-link" href="/terms">
              Terms
            </Link>
          </nav>
          <div className="flex items-center gap-2.5">
            <Avatar>
              <AvatarFallback>
                {user.name.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {user.email}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Sign out"
              onClick={async () => {
                await authClient.signOut();
                localStorage.removeItem("postdispatch-project");
                router.replace("/signin");
                router.refresh();
              }}
            >
              <LogOut aria-hidden="true" />
            </Button>
          </div>
        </SidebarFooter>
      </Sidebar>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b bg-card px-5 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <SidebarTrigger />
            <Separator orientation="vertical" className="h-4" />
            <span className="truncate text-sm text-muted-foreground">
              {project?.name || "Workspace"}
            </span>
            <span className="text-muted-foreground/50" aria-hidden="true">
              /
            </span>
            <span className="shrink-0 text-sm font-medium">{view}</span>
          </div>
          <Badge variant="secondary" className="hidden sm:inline-flex">
            <ShieldCheck aria-hidden="true" />
            Human approval
          </Badge>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-7 px-5 py-8 sm:px-8 lg:py-10"
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-col gap-2">
              <h1 className="text-page font-semibold">{headings[view][0]}</h1>
              <p className="text-sm text-muted-foreground">
                {headings[view][1]}
              </p>
            </div>
            <Button
              size="lg"
              disabled={loading || busy || !project}
              onClick={newDraft}
            >
              <Plus data-icon="inline-start" aria-hidden="true" />
              New draft
            </Button>
          </div>
          {notice && !editing && (
            <Alert role="status" aria-live="polite">
              <AlertDescription>{notice}</AlertDescription>
              <AlertAction>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Dismiss notification"
                  onClick={() => setNotice("")}
                >
                  <X aria-hidden="true" />
                </Button>
              </AlertAction>
            </Alert>
          )}
          {inbox && (
            <>
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <ToggleGroup
                  type="single"
                  value={filter}
                  onValueChange={(value) => {
                    if (value) updateFilter(value);
                  }}
                  aria-label="Filter by channel"
                  variant="outline"
                  spacing={0}
                >
                  <ToggleGroupItem value="all">All posts</ToggleGroupItem>
                  {platforms.map((platform) => (
                    <ToggleGroupItem key={platform} value={platform}>
                      {channelLabels[platform]}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <InputGroup className="sm:w-64">
                  <InputGroupInput
                    name="search"
                    type="search"
                    aria-label="Search posts"
                    autoComplete="off"
                    placeholder="Search posts…"
                    value={search}
                    onChange={(event) => updateSearch(event.target.value)}
                  />
                  <InputGroupAddon>
                    <Search aria-hidden="true" />
                  </InputGroupAddon>
                </InputGroup>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">
                  {loading
                    ? "Loading posts…"
                    : `${visible.length} ${view === "Published" ? "published" : visible.length === 1 ? "draft" : "drafts"}`}
                </p>
                <span className="text-xs text-muted-foreground">
                  Newest first
                </span>
              </div>
              {loading ? (
                <div
                  aria-label="Loading posts"
                  role="status"
                  className="grid gap-6 md:grid-cols-2 xl:grid-cols-3"
                >
                  {[0, 1, 2].map((item) => (
                    <div
                      key={item}
                      className="flex flex-col gap-4 rounded-xl border bg-card p-4"
                    >
                      <Skeleton className="aspect-[4/3] w-full" />
                      <Skeleton className="h-5 w-2/3" />
                      <Skeleton className="h-16 w-full" />
                    </div>
                  ))}
                </div>
              ) : visible.length ? (
                <div className="grid items-stretch gap-6 md:grid-cols-2 xl:grid-cols-3">
                  {visible.map((post) => (
                    <PostCard
                      key={post.id}
                      post={post}
                      busy={busy}
                      onEdit={() => edit(post)}
                      onPublish={() => setConfirm(post)}
                      onDelete={() => setDeleteConfirm(post)}
                    />
                  ))}
                </div>
              ) : search || filter !== "all" || view === "Published" ? (
                <Empty className="min-h-80 border">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      {view === "Published" ? (
                        <Send aria-hidden="true" />
                      ) : (
                        <Search aria-hidden="true" />
                      )}
                    </EmptyMedia>
                    <EmptyTitle>
                      <h2>
                        {search || filter !== "all"
                          ? "No matching posts"
                          : "Your first dispatch is ahead"}
                      </h2>
                    </EmptyTitle>
                    <EmptyDescription>
                      {search || filter !== "all"
                        ? "Try another search or channel."
                        : "Published posts appear here after you approve and send them."}
                    </EmptyDescription>
                  </EmptyHeader>
                  <EmptyContent>
                    <Button
                      variant="outline"
                      onClick={() => {
                        if (search || filter !== "all") {
                          updateSearch("");
                          updateFilter("all");
                        } else navigate("Inbox");
                      }}
                    >
                      {search || filter !== "all"
                        ? "Clear filters"
                        : "Back to inbox"}
                    </Button>
                  </EmptyContent>
                </Empty>
              ) : (
                <div className="grid overflow-hidden rounded-2xl border bg-card lg:grid-cols-[1.2fr_1fr]">
                  <Empty className="items-start px-8 py-14 text-left sm:px-12">
                    <EmptyHeader className="items-start text-left">
                      <EmptyMedia variant="icon">
                        <Inbox aria-hidden="true" />
                      </EmptyMedia>
                      <EmptyTitle>
                        <h2>A good post starts with a draft.</h2>
                      </EmptyTitle>
                      <EmptyDescription>
                        Create one yourself, or let your assistant send ideas
                        here. Your project’s drafts stay private until you’re
                        ready to share.
                      </EmptyDescription>
                    </EmptyHeader>
                    <EmptyContent className="items-start">
                      <Button size="lg" onClick={newDraft}>
                        <Plus data-icon="inline-start" aria-hidden="true" />
                        Create your first draft
                      </Button>
                      <Button
                        variant="link"
                        onClick={() => navigate("MCP integration")}
                      >
                        Connect your assistant
                      </Button>
                    </EmptyContent>
                  </Empty>
                  <div className="border-t bg-background p-8 sm:p-12 lg:border-t-0 lg:border-l">
                    <FlowPanel />
                  </div>
                </div>
              )}
              <p className="flex items-center justify-center gap-1.5 py-2 text-xs text-muted-foreground">
                <Check className="size-3.5" aria-hidden="true" />
                Nothing goes live until you approve it.
              </p>
            </>
          )}
          {view === "Connections" && project && (
            <ProjectSettings
              key={project.id}
              project={project}
              creating={creatingProject}
              onSaved={() => refresh()}
              onCreated={async (id, token) => {
                setCreatingProject(false);
                setOAuthConnections([]);
                await refresh(id);
                setMcpToken(token);
                navigate("MCP integration", id);
                setNotice(
                  "Project created. Copy its bearer token below, or connect your assistant with OAuth.",
                );
              }}
            />
          )}
          {view === "MCP integration" && (
            <AssistantSettings
              project={project}
              endpoint={`${origin}/api/mcp/${projectId}`}
              token={mcpToken}
              busy={busy || loading}
              configured={connections.mcp}
              grants={oauthConnections}
              onRotate={() => void rotateMcpToken()}
              onRevoke={revoke}
              onNotice={setNotice}
            />
          )}
        </main>
      </div>
      <DraftEditor
        editing={editing}
        initialSnapshot={initialDraft}
        form={form}
        setForm={setForm}
        items={mediaItems}
        setItems={setMediaItems}
        busy={busy}
        notice={notice}
        onNotice={setNotice}
        onSave={save}
        onClose={() => setEditing(null)}
        onDelete={() => {
          const post = posts.find((item) => item.id === editing);
          if (post) {
            setEditing(null);
            setDeleteConfirm(post);
          }
        }}
      />
      <AlertDialog
        open={!!deleteConfirm}
        onOpenChange={(open) => {
          if (!open && !busy) setDeleteConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this post?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleteConfirm?.title}” and its stored media will be permanently
              removed from PostDispatch. Posts already published on Facebook or
              Instagram remain there.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                if (deleteConfirm) void remove(deleteConfirm.id);
              }}
            >
              <Trash2 data-icon="inline-start" aria-hidden="true" />
              {busy ? "Deleting…" : "Delete post"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={!!confirm}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publish this post?</AlertDialogTitle>
            <AlertDialogDescription>
              “{confirm?.title}” will go live now on{" "}
              {confirm?.platforms.join(" and ")}. This creates a real post on
              your connected accounts.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>
              Keep reviewing
            </AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={() => void publish()}>
              <Send data-icon="inline-start" aria-hidden="true" />
              Publish now
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
  );
}
