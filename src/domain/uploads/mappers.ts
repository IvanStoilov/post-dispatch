import "server-only";
import type { imageUploads } from "@/db/schema";
import type { AssetUploadDto } from "@/shared/schemas/upload";

export function toAssetUploadDto(
  upload: typeof imageUploads.$inferSelect,
): AssetUploadDto {
  return {
    assetUploadId: upload.id,
    imageUploadId: upload.id,
    kind: upload.kind,
    expiresAt: new Date(upload.expiresAt).toISOString(),
  };
}
