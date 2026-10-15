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
  CircleAlert,
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
import { cn } from "cn";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { PlatformName } from "./platform-name";

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
    draft: { label: "Awaiting review", icon: Sparkles, color: "secondary" },
    published: { label: "Published", icon: Check, color: "success" },
    publishing: { label: "Publishing…", icon: Send, color: "secondary" },
    needs_review: {
      label: "Needs attention",
      icon: AlertCircle,
      color: "destructive-strong",
    },
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
                  ? "destructive-strong"
                  : post.status === "published"
                    ? "default"
                    : "secondary"
              }
            >
              {post.status === "published" && <Check aria-hidden="true" />}
              {label.label}
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
                <div key={delivery.platform}>
                  {channelLabels[delivery.platform]}:{" "}
                  <ChannelStatus status={delivery.status} />
                </div>
              ))}
            </div>
          )}
          {post.deliveries?.some((delivery) => delivery.error) && (
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  See problems
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Delivery Errors</DialogTitle>
                  <DialogDescription>
                    Some of the deliveries for this post have encountered
                    errors.
                  </DialogDescription>
                  {post.deliveries
                    ?.map((delivery) => delivery.error)
                    .filter(Boolean).length > 0 &&
                    post.deliveries
                      ?.filter((delivery) => delivery.error)
                      .map((delivery, index) => (
                        <div key={index} className="mb-2">
                          <div className="font-medium mb-1">
                            <PlatformName platform={delivery.platform} />
                          </div>
                          <div className="text-destructive flex items-start gap-1 shrink-0">
                            <CircleAlert
                              size={14}
                              className="shrink-0 mt-0.5"
                              aria-hidden="true"
                            />
                            <span>{delivery.error}</span>
                          </div>
                        </div>
                      ))}
                </DialogHeader>
              </DialogContent>
            </Dialog>
          )}
          {!!post.publications?.length && (
            <PublicationPanel
              projectId={post.projectId}
              postId={post.id}
              initial={post.publications}
            />
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
            <div className="flex-1 text-sm leading-relaxed text-muted-foreground">
              {post.status === "published" ? (
                <div className="text-success text-right">
                  Delivered to your channels.
                </div>
              ) : post.status === "publishing" ? (
                "Delivery continues in the background. You can close this page."
              ) : (
                "Check your channels before resubmitting."
              )}
            </div>
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

function ChannelStatus({ status }: { status: string }) {
  const statusMap: Record<string, { label: string; color: string }> = {
    queued: { label: "Queued", color: "secondary" },
    preparing: { label: "Preparing media", color: "secondary" },
    waiting: { label: "Processing media", color: "secondary" },
    submitting: { label: "Submitting", color: "secondary" },
    published: { label: "✓ Published", color: "success" },
    failed: { label: "Failed before submission", color: "destructive" },
    needs_review: {
      label: "Check account - outcome uncertain",
      color: "destructive",
    },
  };

  const label = statusMap[status] || { label: status, color: "secondary" };
  return (
    <span
      className={cn(
        label.color === "success"
          ? "text-success"
          : label.color === "destructive"
            ? "text-destructive"
            : "",
      )}
    >
      {label.label}
    </span>
  );
}
