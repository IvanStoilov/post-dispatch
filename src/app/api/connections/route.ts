import { connections } from "@/lib/meta";
import { authenticated, ownedProject } from "@/lib/api-auth";
export async function GET(req: Request) {
  return authenticated(req, async (userId) =>
    Response.json(await connections(await ownedProject(req, userId))),
  );
}
