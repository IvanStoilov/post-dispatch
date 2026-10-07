import { receiveImageUpload, UploadError } from "@/lib/uploads";
export const runtime = "nodejs";
// Agents POST image bytes here with an upload token from the
// create_upload_token MCP tool.
export async function POST(req: Request) {
  try {
    return Response.json(
      await receiveImageUpload(
        new URL(req.url).searchParams.get("projectId") || "",
        req,
      ),
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof UploadError)
      return Response.json({ error: e.message }, { status: e.status });
    console.error("Image upload failed", e);
    return Response.json({ error: "Image upload failed" }, { status: 500 });
  }
}
