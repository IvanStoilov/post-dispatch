import { loggedRequest, logger } from "@/lib/logger";
import { receiveImageUpload, UploadError } from "@/lib/uploads";
export const runtime = "nodejs";
// Agents POST image bytes here with an upload token from the
// create_upload_token MCP tool.
export async function POST(req: Request) {
  return loggedRequest(req, "/api/mcp/uploads", async () => {
    try {
      return Response.json(
        await receiveImageUpload(
          new URL(req.url).searchParams.get("projectId") || "",
          req,
        ),
        { status: 201 },
      );
    } catch (e) {
      logger.warn("http.handler.rejected", { error: e });

      if (e instanceof UploadError)
        return Response.json({ error: e.message }, { status: e.status });
      logger.error("upload.failure", { error: e });
      return Response.json({ error: "Image upload failed" }, { status: 500 });
    }
  });
}
