export type AssetKind = "IMAGE" | "VIDEO";
export type StoredAsset = {
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
export type Platform = "instagram" | "facebook";
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
  error?: string;
};

export type Project = {
  id: string;
  name: string;
  facebookPageId: string;
  instagramAccountId: string;
  instagramApiHost: "graph.facebook.com" | "graph.instagram.com";
  facebookConfigured: boolean;
  instagramConfigured: boolean;
  mcpConfigured: boolean;
};
