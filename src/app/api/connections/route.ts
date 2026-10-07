import { connections } from "@/lib/publishing";
import { authenticated, ownedProject } from "@/lib/api-auth";
export async function GET(req: Request) {
  return authenticated(req, async (userId) =>
    Response.json(await connections(await ownedProject(req, userId))),
  );
}
