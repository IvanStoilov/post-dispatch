import { onError, ORPCError } from "@orpc/server";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { BodyLimitPlugin } from "@orpc/server/fetch";
import { loggedRequest, logger } from "@/lib/logger";
import { router } from "@/server/router";
export const runtime = "nodejs";
// Creating a post can download media from URLs, which can take minutes.
export const maxDuration = 300;

// REST routes from src/contract (e.g. PUT /api/v1/projects/{id}).
const handler = new OpenAPIHandler(router, {
  // Drafts can carry small inline images; matches the legacy routes.
  plugins: [new BodyLimitPlugin({ maxBodySize: 12 * 1024 * 1024 })],
  interceptors: [
    // Expected errors (validation, sign-in) reach the client as defined
    // ORPCErrors; anything else is logged here and sent as a generic 500.
    onError((error) => {
      if (
        !(error instanceof ORPCError) ||
        (!error.defined && error.status >= 500)
      )
        logger.error("rpc.procedure.failed", { error });
    }),
  ],
});
async function handle(request: Request) {
  return loggedRequest(request, "/api/v1", async () => {
    const { response } = await handler.handle(request, {
      prefix: "/api/v1",
      context: { headers: request.headers },
    });
    return response ?? Response.json({ error: "Not found" }, { status: 404 });
  });
}
export {
  handle as GET,
  handle as POST,
  handle as PUT,
  handle as PATCH,
  handle as DELETE,
};
