export type Platform = "instagram" | "facebook";
export type Post = {
  id: string;
  title: string;
  caption: string;
  imageUrl: string;
  platforms: Platform[];
  source: string;
  status: "draft" | "publishing" | "published" | "needs_review";
  createdAt: string;
  results: Partial<Record<Platform, string>>;
  error?: string;
};
