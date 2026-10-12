"use client";
import { useWorkspace } from "@/components/workspace-shell";
import { projectPath } from "@/lib/route-paths";
import { useSearchParams } from "next/navigation";
import { PublicationPanel } from "@/components/publication-panel";
import { useAppPath } from "@/components/app-navigation";
import { platforms, channelLabels } from "@/lib/connectors/catalog";
import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import DraftEditor, { type Draft, type MediaItem } from "./draft-editor";
import { PostCard } from "@/components/post-card";

import { FlowPanel } from "@/components/flow-panel";
import { Button } from "@/components/ui/button";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
} from "@/components/ui/input-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "@/components/ui/sonner";
import { Skeleton } from "@/components/ui/skeleton";

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

import { Inbox, Send, Plus, Search, Check, Trash2 } from "lucide-react";
import type { Post, Platform } from "@/lib/types";
const blank: Draft = {
  title: "",
  caption: "",
  imageUrl: "",
  platforms: ["facebook"],
  source: "Manual",
};
export default function PostsWorkspace({
  publishedView = false,
}: {
  publishedView?: boolean;
}) {
  const { project, setCounts } = useWorkspace();
  if (!project) throw new Error("No active project");
  const projectId = project.id;
  const appPath = useAppPath();
  const router = useRouter();
  const query = useSearchParams();
  const view = publishedView ? "Published" : "Inbox";
  const filter = platforms.some((p) => p === query.get("channel"))
    ? query.get("channel")!
    : "all";
  const search = query.get("search") || "";
  const [posts, setPosts] = useState<Post[]>([]);
  const requestSequence = useRef(0);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Draft>(blank);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [initialDraft, setInitialDraft] = useState("");

  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState<Post | null>(null);
  const [publishError, setPublishError] = useState("");
  const missingChannels =
    confirm?.platforms.filter(
      (platform) => !project.connectors?.[platform]?.configured,
    ) || [];
  const [deleteConfirm, setDeleteConfirm] = useState<Post | null>(null);
  const refresh = useCallback(async () => {
    const sequence = ++requestSequence.current;
    try {
      const p = await fetch(`/api/posts?projectId=${projectId}`, {
        cache: "no-store",
      });
      if (p.status === 401) {
        router.replace(appPath("/signin"));
        return;
      }
      if (!p.ok) throw new Error("Could not load project workspace");
      const data: Post[] = await p.json();
      if (sequence !== requestSequence.current) return;
      setPosts(data);
      setCounts({
        drafts: data.filter((p: Post) => p.status !== "published").length,
        published: data.filter((p: Post) => p.status === "published").length,
      });
    } catch (e) {
      if (sequence === requestSequence.current)
        toast.error(e instanceof Error ? e.message : "Could not load posts", {
          id: `posts-load-${projectId}`,
        });
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, [projectId, router, appPath, setCounts, setLoading, setPosts]);
  useEffect(() => {
    const sequence = requestSequence;
    const initial = setTimeout(() => void refresh(), 0);
    const timer = setInterval(() => void refresh(), 15000);
    return () => {
      ++sequence.current;
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [refresh]);
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
        toast.loading(`Uploading ${item.file.name}…`, {
          id: `post-operation-${projectId}`,
        });
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
      toast.success("Draft saved. Ready when you are.", {
        id: `post-operation-${projectId}`,
      });
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed", {
        id: `post-operation-${projectId}`,
      });
      setNotice(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }
  async function publish() {
    if (!confirm) return;
    setBusy(true);
    const p = confirm;
    setPublishError("");
    try {
      toast.loading(
        p.assets[0]?.kind === "VIDEO"
          ? "Publishing video… Instagram processing may take a few minutes."
          : "Publishing…",
        { id: `post-operation-${projectId}` },
      );
      await request(`/api/posts/${p.id}/publish`, "POST");
      setConfirm(null);
      toast.success(
        "Publishing queued. You can close this page; progress will update automatically.",
        { id: `post-operation-${projectId}` },
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : "Publishing failed";
      setPublishError(message);
      toast.error(message, { id: `post-operation-${projectId}` });
    } finally {
      await refresh();
      setBusy(false);
    }
  }
  async function retryPublication(id: string) {
    setBusy(true);
    try {
      await request(`/api/posts/${id}/retry`, "POST");
      toast.success(
        "Retry queued for failed channels. Completed channels will be skipped.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Retry failed");
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
      toast.success("Post deleted.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
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
  function navigate(next: "Inbox" | "MCP integration") {
    router.push(
      appPath(projectPath(projectId, next === "Inbox" ? "inbox" : "assistant")),
    );
  }
  function updateQuery(key: string, value: string) {
    const next = new URLSearchParams(window.location.search);
    if (value && value !== "all") next.set(key, value);
    else next.delete(key);
    const path = window.location.pathname;
    window.history.replaceState(
      null,
      "",
      `${path}${next.size ? `?${next}` : ""}`,
    );
  }
  const updateFilter = (value: string) => updateQuery("channel", value);
  const updateSearch = (value: string) => updateQuery("search", value);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="display-m">
            {publishedView ? "Published posts" : "Draft inbox"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {publishedView
              ? "The posts you’ve approved and shared."
              : "Review the ideas. Make the final call."}
          </p>
        </div>
        {publishedView && (
          <PublicationPanel
            projectId={project.id}
            label="All published copies"
          />
        )}
        <Button
          size="lg"
          disabled={loading || busy || !project}
          onClick={newDraft}
        >
          <Plus data-icon="inline-start" aria-hidden="true" />
          New draft
        </Button>
      </div>
      {
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
            <span className="text-xs text-muted-foreground">Newest first</span>
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
                  onPublish={() => {
                    setPublishError("");
                    setConfirm(post);
                  }}
                  onRetry={() => void retryPublication(post.id)}
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
                    Create one yourself, or let your assistant send ideas here.
                    Your project’s drafts stay private until you’re ready to
                    share.
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
      }
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
              removed from Ramblo. Published copies on social networks remain
              there, and their references are preserved.
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
          {(missingChannels.length > 0 || publishError) && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>
                {missingChannels.length > 0 ? (
                  <>
                    {missingChannels.map((p) => channelLabels[p]).join(" and ")}{" "}
                    {missingChannels.length > 1 ? "aren't" : "isn't"} connected
                    or its connection has expired. Connect the account in this
                    project before publishing.
                  </>
                ) : (
                  publishError
                )}
                <Link
                  href={appPath(projectPath(projectId, "connections"))}
                  className="mt-2 block font-medium underline"
                >
                  Open Connections
                </Link>
              </AlertDescription>
            </Alert>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>
              Keep reviewing
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={busy || missingChannels.length > 0}
              onClick={(event) => {
                event.preventDefault();
                void publish();
              }}
            >
              <Send data-icon="inline-start" aria-hidden="true" />
              {busy ? "Submitting…" : "Publish now"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
