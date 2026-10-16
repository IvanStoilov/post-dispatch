// Moved to src/shared/schemas/asset.ts and src/domain/posts; re-exported
// for unmigrated code.
export {
  httpsUrl,
  openaiFileSchema,
  assetInputSchema,
  editableAssetSchema,
  type AssetInput,
} from "../shared/schemas/asset";
import { postsSystemService } from "@/domain/posts";
export const validateAssetKinds = postsSystemService.validateAssetKinds;
