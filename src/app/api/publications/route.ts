import { authenticated, ownedProject } from "@/lib/api-auth";
import { listPublications } from "@/lib/publications";
import { loggedRequest } from "@/lib/logger";
import { z } from "zod";
export async function GET(req: Request) {
  return loggedRequest(req, "/api/publications", () =>
    authenticated(req, async (userId) => {
      const projectId = await ownedProject(req, userId);
      const raw = new URL(req.url).searchParams.get("postId");
      if (raw && !z.uuid().safeParse(raw).success)
        return Response.json({ error: "Invalid post ID" }, { status: 400 });
      return Response.json(await listPublications(projectId, raw || undefined));
    }),
  );
}
