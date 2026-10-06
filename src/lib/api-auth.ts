import { getAuth } from "./auth";
import { getOwnedProject } from "./projects";
class AccessError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
export async function authenticated(
  req: Request,
  fn: (userId: string) => Promise<Response>,
) {
  try {
    const session = await getAuth().api.getSession({ headers: req.headers });
    if (!session) throw new AccessError("Sign in to continue", 401);
    return await fn(session.user.id);
  } catch (error) {
    if (error instanceof AccessError)
      return Response.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
export async function ownedProject(req: Request, userId: string, id?: string) {
  const projectId = id || new URL(req.url).searchParams.get("projectId") || "";
  try {
    await getOwnedProject(userId, projectId);
  } catch {
    throw new AccessError("Project not found", 404);
  }
  return projectId;
}
