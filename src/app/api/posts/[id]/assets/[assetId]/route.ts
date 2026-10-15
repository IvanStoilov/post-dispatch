import { loggedRequest } from "@/lib/logger";
import { authenticated, ownedProject } from "@/lib/api-auth";
import { getPostImage, storedAssets } from "@/lib/store";
import { getAssetUrl } from "@/lib/storage";
export const runtime = "nodejs";
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string; assetId: string }> },
) {
  return loggedRequest(req, "/api/posts/[id]/assets/[assetId]", async () => {
    return authenticated(req, async (userId) => {
      const projectId = await ownedProject(req, userId);
      const { id, assetId } = await ctx.params;
      let asset;
      try {
        asset = storedAssets(await getPostImage(projectId, id)).find(
          (item) => item.id === assetId,
        );
      } catch {
        return new Response(null, { status: 404 });
      }
      if (!asset) return new Response(null, { status: 404 });
      try {
        // S3 serves production media directly; local storage serves private dev URLs.
        return new Response(null, {
          status: 307,
          headers: {
            Location: await getAssetUrl(asset, 300),
            "Cache-Control": "private, no-store",
            "Referrer-Policy": "no-referrer",
          },
        });
      } catch {
        return Response.json({ error: "Media unavailable" }, { status: 502 });
      }
    });
  });
}
