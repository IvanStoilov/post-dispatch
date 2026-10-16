import { z } from "zod";
import { UserFacingError } from "@/domain/shared/errors";
import { uploadsService } from "@/domain/uploads";
import { loggedRequest, logger } from "@/lib/logger";
import { readBody } from "@/lib/request-body";
import { storageProvider } from "@/lib/storage/index";
export const runtime = "nodejs";
export const maxDuration = 300;

// Receives direct uploads when media is stored locally, in place of an S3
// presigned PUT URL.

class TooLarge extends Error {}

export async function PUT(request: Request) {
  return loggedRequest(request, "/api/mcp/uploads/local", async () => {
    try {
      storageProvider("local");
    } catch {
      return new Response(null, { status: 404 });
    }
    const uploadId = new URL(request.url).searchParams.get("uploadId");
    if (!z.uuid().safeParse(uploadId).success)
      return Response.json({ error: "Invalid upload ID" }, { status: 400 });
    try {
      await uploadsService.writeLocalFile(
        {
          uploadId: uploadId!,
          contentType: request.headers.get("content-type")?.split(";")[0] ?? "",
        },
        (limit) =>
          readBody(request, limit, "File upload").catch(() => {
            throw new TooLarge();
          }),
      );
      return new Response(null, { status: 204 });
    } catch (error) {
      if (error instanceof TooLarge)
        return Response.json(
          { error: "Upload exceeds its declared size" },
          { status: 413 },
        );
      if (error instanceof UserFacingError)
        return Response.json(
          { error: error.message },
          { status: error.status },
        );
      logger.error("storage.local.upload.failed", { error });
      return Response.json(
        { error: "Could not store uploaded file" },
        { status: 503 },
      );
    }
  });
}
