import { createProject, listProjects } from "@/lib/projects";
import { authenticated } from "@/lib/api-auth";
export async function GET(req: Request) {
  return authenticated(req, async (userId) =>
    Response.json(await listProjects(userId)),
  );
}
export async function POST(req: Request) {
  return authenticated(req, async (userId) => {
    try {
      return Response.json(await createProject(userId, await req.json()), {
        status: 201,
      });
    } catch {
      return Response.json(
        { error: "Invalid project configuration" },
        { status: 400 },
      );
    }
  });
}
