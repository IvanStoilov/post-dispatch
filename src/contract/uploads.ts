import {
  assetUploadDto,
  completeUploadInput,
  startUploadInput,
  uploadTargetDto,
} from "@/shared/schemas/upload";
import { base } from "./base";

// Direct-to-storage uploads: start returns a short-lived PUT URL; after
// the browser PUTs the file there, complete stores it for one draft.
export const uploadsContract = {
  start: base
    .route({
      method: "POST",
      path: "/projects/{projectId}/uploads",
      successStatus: 201,
    })
    .input(startUploadInput)
    .output(uploadTargetDto),
  complete: base
    .route({
      method: "POST",
      path: "/projects/{projectId}/uploads/{uploadId}/complete",
    })
    .input(completeUploadInput)
    .output(assetUploadDto),
};
