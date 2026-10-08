import { loggedOperation, logger, withLogContext } from "./logger";
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
  return loggedOperation("lib.api-auth.authenticated", {}, async () => {
    try {
      const session = await getAuth().api.getSession({ headers: req.headers });
      if (!session) throw new AccessError("Sign in to continue", 401);
      logger.debug("auth.session.accepted", { userId: session.user.id });
      return await withLogContext({ userId: session.user.id }, () =>
        fn(session.user.id),
      );
    } catch (error) {
      if (error instanceof AccessError) {
        logger.warn("auth.access.denied", {
          status: error.status,
          reason: error.message,
        });
        return Response.json(
          { error: error.message },
          { status: error.status },
        );
      }
      throw error;
    }
  });
}
export async function ownedProject(req: Request, userId: string, id?: string) {
  return loggedOperation("lib.api-auth.ownedProject", { userId }, async () => {
    const projectId =
      id || new URL(req.url).searchParams.get("projectId") || "";
    try {
      await getOwnedProject(userId, projectId);
    } catch {
      throw new AccessError("Project not found", 404);
    }
    return projectId;
  });
}
