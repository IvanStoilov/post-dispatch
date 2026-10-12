"use client";
import { useState } from "react";
import type { Publication } from "@/lib/types";
import { channelLabels } from "@/lib/connectors/catalog";
import { publicationCapabilities } from "@/lib/connectors/publication-capabilities";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "./ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "./ui/alert-dialog";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";
import { ExternalLink, RefreshCw } from "lucide-react";
export function PublicationPanel({
  projectId,
  postId,
  initial = [],
  label = "Published copies",
}: {
  projectId: string;
  postId?: string;
  initial?: Publication[];
  label?: string;
}) {
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [deleting, setDeleting] = useState<Publication | null>(null);
  async function load() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/publications?projectId=${projectId}${postId ? `&postId=${postId}` : ""}`,
        { cache: "no-store" },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not load published copies.");
      setItems(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load copies.");
    } finally {
      setBusy(false);
    }
  }
  async function act(
    publication: Publication,
    method: "POST" | "PATCH" | "DELETE",
  ) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/publications/${publication.id}?projectId=${projectId}`,
        {
          method,
          ...(method === "PATCH"
            ? {
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ caption }),
              }
            : {}),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not complete the request.");
      setItems((old) => old.map((p) => (p.id === data.id ? data : p)));
      setEditing(null);
      setDeleting(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network request failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Dialog
        onOpenChange={(open) => {
          if (open) void load();
        }}
      >
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            {label}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Published copies</DialogTitle>
            <DialogDescription>
              Each network has its own post. Changes here affect only the
              selected copy.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {busy && (
            <p role="status" className="text-sm text-muted-foreground">
              Working…
            </p>
          )}
          {!busy && !items.length && (
            <p className="text-sm text-muted-foreground">
              No published copies yet.
            </p>
          )}
          {items.map((p) => {
            const can = publicationCapabilities(p);
            return (
              <section key={p.id} className="space-y-3 rounded-lg border p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-semibold">{channelLabels[p.platform]}</h3>
                  <span className="text-xs capitalize text-muted-foreground">
                    {p.status}
                  </span>
                </div>
                {!p.postId && (
                  <p className="text-xs text-muted-foreground">
                    The Ramblo draft has been removed. This reference is
                    preserved.
                  </p>
                )}
                <p className="break-all text-xs text-muted-foreground">
                  Post ID: {p.remotePostId}
                </p>
                <p className="text-xs text-muted-foreground">
                  Published {new Date(p.publishedAt).toLocaleString()}
                </p>
                {p.caption && (
                  <p className="whitespace-pre-wrap break-words text-sm">
                    {p.caption}
                  </p>
                )}
                {!!Object.keys(p.metrics).length && (
                  <div className="flex flex-wrap gap-4 text-sm">
                    {Object.entries(p.metrics).map(([name, value]) => (
                      <span key={name}>
                        <strong>{value.toLocaleString()}</strong> {name}
                      </span>
                    ))}
                  </div>
                )}
                {p.refreshedAt && (
                  <p className="text-xs text-muted-foreground">
                    Stats refreshed {new Date(p.refreshedAt).toLocaleString()}
                  </p>
                )}
                {!p.accountId && (
                  <p className="text-xs text-muted-foreground">
                    The original publishing account was not recorded. This
                    reference is read-only.
                  </p>
                )}
                {p.platform === "instagram" && (
                  <p className="text-xs text-muted-foreground">
                    Edit or delete this post in Instagram.
                  </p>
                )}
                {p.platform === "linkedin" && (
                  <p className="text-xs text-muted-foreground">
                    View stats directly on LinkedIn.
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {p.permalink && p.status !== "deleted" && (
                    <Button variant="outline" size="sm" asChild>
                      <a
                        href={p.permalink}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open post <ExternalLink className="size-3" />
                      </a>
                    </Button>
                  )}
                  {can.refresh && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => void act(p, "POST")}
                    >
                      <RefreshCw className="size-3" /> Refresh link & stats
                    </Button>
                  )}
                  {can.edit && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => {
                        setEditing(p.id);
                        setCaption(p.caption);
                      }}
                    >
                      Edit caption
                    </Button>
                  )}
                  {can.delete && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => setDeleting(p)}
                    >
                      Delete from {channelLabels[p.platform]}
                    </Button>
                  )}
                </div>
                {editing === p.id && (
                  <div className="space-y-2">
                    <Label htmlFor={`caption-${p.id}`}>
                      Caption on {channelLabels[p.platform]}
                    </Label>
                    <Textarea
                      id={`caption-${p.id}`}
                      value={caption}
                      maxLength={2200}
                      onChange={(e) => setCaption(e.target.value)}
                      disabled={busy}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={busy || !caption.trim()}
                        onClick={() => void act(p, "PATCH")}
                      >
                        Save on {channelLabels[p.platform]}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => setEditing(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </section>
            );
          })}
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open && !busy) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this published copy?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the post from{" "}
              {deleting && channelLabels[deleting.platform]}. The Ramblo draft
              and copies on other networks remain.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                if (deleting) void act(deleting, "DELETE");
              }}
            >
              {busy ? "Deleting…" : "Delete published copy"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
