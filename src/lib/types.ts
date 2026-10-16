export type AssetKind = "IMAGE" | "VIDEO";
export type StoredAsset = {
  storageProvider: "local" | "s3";
  id: string;
  kind: AssetKind;
  imageKey: string;
  imageBucket: string;
  mimeType: "image/jpeg" | "video/mp4";
};
// Moving to src/shared: platforms and project DTOs live there now.
export { platforms, type Platform } from "../shared/platforms";
export type {
  ConnectionSummaryDto as ConnectionSummary,
  ProjectDto as Project,
} from "../shared/schemas/project";
export type {
  PostAssetDto as PostAsset,
  PostDto as Post,
} from "../shared/schemas/post";
export type { PublicationDto as Publication } from "../shared/schemas/publication";
