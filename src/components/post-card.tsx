"use client";
import { PublicationPanel } from "./publication-panel";
import { PostPlaceholder } from "./post-placeholder";
import { channelLabels } from "@/lib/connectors/catalog";
import { channelIcons } from "./channel-catalog";
import {
  Check,
  Sparkles,
  Trash2,
  MoreVertical,
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
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Alert, AlertDescription } from "@/components/ui/alert";
import MediaGallery from "@/app/media-gallery";
import type { Post, Platform } from "@/lib/types";

export function PlatformBadge({ platform }: { platform: Platform }) {
  const Icon = channelIcons[platform];
  return (
    <Badge variant="outline">
      <Icon data-icon="inline-start" aria-hidden="true" />
      {channelLabels[platform]}
    </Badge>
  );
}
export function PostCard({
  post,
  busy,
  onEdit,
  onPublish,
  onDelete,
  onRetry,
}: {
  post: Post;
  busy: boolean;
  onEdit: () => void;
  onPublish: () => void;
  onDelete: () => void;
  onRetry: () => void;
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
            <PostPlaceholder />
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
          {!!post.deliveries?.length && (
            <div
              className="flex flex-col gap-1 text-xs text-muted-foreground"
              aria-live="polite"
            >
              {post.deliveries.map((delivery) => (
                <p key={delivery.platform}>
                  {channelLabels[delivery.platform]}:{" "}
                  {
                    {
                      queued: "Queued",
                      preparing: "Preparing media",
                      waiting: "Processing media",
                      submitting: "Submitting",
                      published: "Published",
                      failed: "Failed before submission",
                      needs_review: "Check account — outcome uncertain",
                    }[delivery.status]
                  }
                </p>
              ))}
            </div>
          )}
          {!!post.publications?.length && (
            <PublicationPanel
              projectId={post.projectId}
              postId={post.id}
              initial={post.publications}
            />
          )}
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
          {post.status !== "publishing" && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={busy}
                  aria-label={`Actions for ${post.title}`}
                >
                  <MoreVertical aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  variant="destructive"
                  disabled={busy}
                  onSelect={onDelete}
                >
                  <Trash2 aria-hidden="true" />
                  Delete post
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {post.status === "draft" ? (
            <>
              <div className="flex-1"></div>
              <Button variant="outline" disabled={busy} onClick={onEdit}>
                Review
              </Button>
              <Button disabled={busy} onClick={onPublish}>
                <Send data-icon="inline-start" aria-hidden="true" />
                Publish
              </Button>
            </>
          ) : (
            <p className="flex-1 text-sm leading-relaxed text-muted-foreground">
              {post.status === "published" ? (
                <div className="text-success text-right">
                  Delivered to your channels.
                </div>
              ) : post.status === "publishing" ? (
                "Delivery continues in the background. You can close this page."
              ) : (
                "Check your channels before resubmitting."
              )}
            </p>
          )}
          {post.status === "needs_review" &&
            post.deliveries?.some((d) => d.status === "failed") && (
              <Button variant="outline" disabled={busy} onClick={onRetry}>
                Retry failed channels
              </Button>
            )}
        </CardFooter>
      </Card>
    </article>
  );
}
