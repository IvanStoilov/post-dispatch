"use client";
import { Facebook, Instagram } from "@/components/channel-icons";
import {
  Check,
  FileText,
  Sparkles,
  Trash2,
  Send,
  AlertCircle,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import MediaGallery from "@/app/media-gallery";
import type { Post, Platform } from "@/lib/types";

export function PlatformBadge({ platform }: { platform: Platform }) {
  const Icon = platform === "instagram" ? Instagram : Facebook;
  return (
    <Badge variant="outline">
      <Icon data-icon="inline-start" aria-hidden="true" />
      {platform === "instagram" ? "Instagram" : "Facebook"}
    </Badge>
  );
}
export function PostCard({
  post,
  busy,
  onEdit,
  onPublish,
  onDelete,
}: {
  post: Post;
  busy: boolean;
  onEdit: () => void;
  onPublish: () => void;
  onDelete: () => void;
}) {
  const label = {
    draft: "Awaiting review",
    published: "Published",
    publishing: "Publishing…",
    needs_review: "Needs attention",
  }[post.status];
  return (
    <article className="min-w-0 [content-visibility:auto] [contain-intrinsic-size:auto_540px] shadow rounded-xl">
      <Card className="h-full pt-0">
        <div className="relative">
          {post.assets.length ? (
            <MediaGallery assets={post.assets} title={post.title} />
          ) : (
            <div className="flex aspect-4/3 flex-col justify-between bg-secondary p-7">
              <FileText className="size-5 text-primary" aria-hidden="true" />
              <p className="line-clamp-4 max-w-xs text-2xl font-semibold leading-snug tracking-tight text-secondary-foreground">
                {post.title}
              </p>
              <span className="text-xs text-muted-foreground">Text post</span>
            </div>
          )}
          <div className="absolute top-3 left-3">
            <Badge
              variant={
                post.status === "needs_review"
                  ? "destructive"
                  : post.status === "published"
                    ? "default"
                    : "secondary"
              }
            >
              {post.status === "published" && <Check aria-hidden="true" />}
              {label}
            </Badge>
          </div>
        </div>
        <CardHeader>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {post.platforms.map((platform) => (
              <PlatformBadge key={platform} platform={platform} />
            ))}
          </div>
          <CardTitle>
            <h3 className="line-clamp-2 break-words">{post.title}</h3>
          </CardTitle>
          <CardDescription className="line-clamp-3 whitespace-pre-wrap break-words">
            {post.caption}
          </CardDescription>
        </CardHeader>
        <CardContent className="mt-auto flex flex-col gap-3">
          {post.error && (
            <Alert variant="destructive">
              <AlertCircle aria-hidden="true" />
              <AlertDescription className="break-words">
                {post.error}
              </AlertDescription>
            </Alert>
          )}
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span className="flex min-w-0 items-center gap-1.5">
              {post.source !== "Manual" && (
                <Sparkles className="size-3 shrink-0" aria-hidden="true" />
              )}
              <span className="truncate">{post.source}</span>
            </span>
            <time className="shrink-0" dateTime={post.createdAt}>
              {new Date(post.createdAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </time>
          </div>
        </CardContent>
        <CardFooter className="flex-wrap gap-2">
          {post.status === "draft" ? (
            <>
              <Button
                variant="outline"
                disabled={busy}
                onClick={onEdit}
                className="flex-1"
              >
                Review & edit
              </Button>
              <Button disabled={busy} onClick={onPublish}>
                <Send data-icon="inline-start" aria-hidden="true" />
                Publish
              </Button>
            </>
          ) : (
            <p className="flex-1 text-xs leading-relaxed text-muted-foreground">
              {post.status === "published"
                ? "Delivered to your channels."
                : post.status === "publishing"
                  ? "Delivery in progress. Check Meta if interrupted."
                  : "Check your channels before resubmitting."}
            </p>
          )}
          {post.status !== "publishing" && (
            <Button
              variant="ghost"
              size="icon"
              disabled={busy}
              aria-label={`Delete ${post.title}`}
              onClick={onDelete}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          )}
        </CardFooter>
      </Card>
    </article>
  );
}
