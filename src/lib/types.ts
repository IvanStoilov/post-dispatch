export type AssetKind = "IMAGE" | "VIDEO";
export type StoredAsset = {
  storageProvider: "local" | "s3";
  id: string;
  kind: AssetKind;
  imageKey: string;
  imageBucket: string;
  mimeType: "image/jpeg" | "video/mp4";
};
export type PostAsset = {
  id: string;
  kind: AssetKind;
  url: string;
  mimeType: string;
};
export const platforms = ["facebook", "instagram", "linkedin"] as const;
export type Platform = (typeof platforms)[number];
export type ConnectionSummary = {
  accountId: string;
  accountName: string;
  configured: boolean;
  expiresAt: string | null;
};
export type Publication = {
  id: string;
  postId: string | null;
  projectId: string;
  platform: Platform;
  accountId: string | null;
  remotePostId: string;
  permalink: string | null;
  caption: string;
  mediaKind: string;
  publishedAt: string;
  status: "published" | "deleted" | "unavailable";
  metrics: Record<string, number>;
  refreshedAt: string | null;
};

export type Post = {
  id: string;
  projectId: string;
  title: string;
  caption: string;
  imageUrl: string;
  assets: PostAsset[];
  platforms: Platform[];
  source: string;
  status: "draft" | "publishing" | "published" | "needs_review";
  createdAt: string;
  results: Partial<Record<Platform, string>>;
  publications?: Publication[];
  error?: string;
  deliveries?: {
    platform: Platform;
    status:
      | "queued"
      | "preparing"
      | "waiting"
      | "submitting"
      | "published"
      | "failed"
      | "needs_review";
    error: string | null;
  }[];
};

export type Project = {
  id: string;
  name: string;
  facebookPageId: string;
  instagramAccountId: string;
  instagramApiHost: "graph.facebook.com" | "graph.instagram.com";
  facebookConfigured: boolean;
  instagramConfigured: boolean;
  connectors?: Partial<Record<Platform, ConnectionSummary>>;
};
