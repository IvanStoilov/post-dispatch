import { imageDraftBody } from "@/lib/request-body";
import { createPost, listPosts } from "@/lib/store";
import { authenticated, ownedProject } from "@/lib/api-auth";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET(req: Request) {
  return authenticated(req, async (userId) =>
    Response.json(await listPosts(await ownedProject(req, userId))),
  );
}
export async function POST(req: Request) {
  return authenticated(req, async (userId) => {
    const id = await ownedProject(req, userId);
    try {
      return Response.json(await createPost(id, await imageDraftBody(req)), {
        status: 201,
      });
    } catch (e) {
      return Response.json(
        { error: e instanceof Error ? e.message : "Invalid draft" },
        { status: 400 },
      );
    }
  });
}
