import { implement, ORPCError, ValidationError } from "@orpc/server";
import { contract } from "@/contract";
import { getAuth } from "@/lib/auth";
import type { Actor } from "@/domain/shared/actor";
import { UserFacingError, type UserFacingStatus } from "@/domain/shared/errors";
import { logger, withLogContext } from "@/lib/logger";

const codes = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  429: "TOO_MANY_REQUESTS",
  502: "BAD_GATEWAY",
} as const satisfies Record<UserFacingStatus, string>;

// Procedures implement the shared contract (src/contract), which fixes
// their routes, input and output. Every request carries its headers.
const api = implement(contract).$context<{ headers: Headers }>();

// The one place errors are translated for the client: invalid input and
// UserFacingErrors from lib/ become the contract's defined errors with their
// message. Anything else stays a generic 500, logged by the /api/v1 route.
export const pub = api.use(async ({ next, path, errors }) => {
  try {
    return await next();
  } catch (error) {
    if (error instanceof ORPCError && error.cause instanceof ValidationError)
      throw errors.BAD_REQUEST({
        message: error.message,
        data: error.data,
        cause: error.cause,
      });
    if (!(error instanceof UserFacingError)) throw error;
    logger.warn("rpc.request.rejected", {
      procedure: path.join("."),
      status: error.status,
      reason: error.message,
    });
    throw errors[codes[error.status]]({ message: error.message, cause: error });
  }
});

// Signed-in procedures. Authentication only: it puts the actor in the
// context, and the domain enforces what that actor may access.
export const authed = pub.use(async ({ context, next }) => {
  const session = await getAuth().api.getSession({ headers: context.headers });
  if (!session) throw new UserFacingError("Sign in to continue", 401);
  const actor: Actor = { userId: session.user.id };
  return withLogContext(actor, () => next({ context: { actor } }));
});
