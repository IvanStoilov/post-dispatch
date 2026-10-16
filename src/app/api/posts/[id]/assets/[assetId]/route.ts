import { postsService } from "@/domain/posts";
import { UserFacingError } from "@/domain/shared/errors";
import { authenticated } from "@/lib/api-auth";
import { loggedRequest } from "@/lib/logger";
import { postAssetRef } from "@/shared/schemas/post";

export const runtime = "nodejs";

// Post media for its owner, linked from PostDto.assets. Redirects to a
// short-lived storage URL: S3 serves production media directly; local
// storage serves private dev URLs.
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string; assetId: string }> },
) {
  return loggedRequest(req, "/api/posts/[id]/assets/[assetId]", () =>
    authenticated(req, async (userId) => {
      const ref = postAssetRef.safeParse({
        ...(await ctx.params),
        projectId: new URL(req.url).searchParams.get("projectId"),
      });
      if (!ref.success) {
        return new Response(null, { status: 404 });
      }
      try {
        const location = await postsService.mediaUrl({ userId }, ref.data);
        return new Response(null, {
          status: 307,
          headers: {
            Location: location,
            "Cache-Control": "private, no-store",
            "Referrer-Policy": "no-referrer",
          },
        });
      } catch (error) {
        if (!(error instanceof UserFacingError)) {
          throw error;
        }
        return Response.json(
          { error: error.message },
          { status: error.status },
        );
      }
    }),
  );
}
