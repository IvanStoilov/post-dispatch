import { UserFacingError } from "@/domain/shared/errors";
import { uploadsService } from "@/domain/uploads";
import { loggedRequest, logger } from "@/lib/logger";
import { readBody } from "@/lib/request-body";
import { completeUploadWithTokenInput } from "@/shared/schemas/upload";

export const runtime = "nodejs";
export const maxDuration = 300;

// Finishes a direct upload without a session: assistants prove it with the
// completion token from create_asset_upload.
export async function POST(req: Request) {
  return loggedRequest(req, "/api/mcp/uploads/complete", async () => {
    let body: unknown;
    try {
      body = JSON.parse(
        (await readBody(req, 4096, "Upload request")).toString(),
      );
    } catch {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }
    const input = completeUploadWithTokenInput.safeParse({
      ...(body as object),
      projectId: new URL(req.url).searchParams.get("projectId"),
    });
    if (!input.success) {
      return Response.json(
        { error: "Provide projectId, uploadId and completionToken" },
        { status: 400 },
      );
    }
    try {
      return Response.json(await uploadsService.completeWithToken(input.data));
    } catch (error) {
      if (!(error instanceof UserFacingError)) {
        throw error;
      }
      logger.warn("http.handler.rejected", { error });
      return Response.json({ error: error.message }, { status: error.status });
    }
  });
}
