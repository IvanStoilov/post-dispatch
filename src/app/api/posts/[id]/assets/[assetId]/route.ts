import { authenticated, ownedProject } from "@/lib/api-auth";
import { getPostImage, storedAssets } from "@/lib/store";
import { publicationImageUrl } from "@/lib/storage";
export const runtime = "nodejs";
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string; assetId: string }> },
) {
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
      // Range requests and streaming happen at S3, keeping videos off Vercel.
      return new Response(null, {
        status: 307,
        headers: {
          Location: await publicationImageUrl(asset, 300),
          "Cache-Control": "private, no-store",
          "Referrer-Policy": "no-referrer",
        },
      });
    } catch {
      return Response.json({ error: "Media unavailable" }, { status: 502 });
    }
  });
}
