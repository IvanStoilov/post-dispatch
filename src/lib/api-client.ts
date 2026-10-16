import { createORPCClient, ORPCError } from "@orpc/client";
import type { ContractRouterClient } from "@orpc/contract";
import type { JsonifiedClient } from "@orpc/openapi-client";
import { OpenAPILink } from "@orpc/openapi-client/fetch";
import { contract } from "@/contract";

// Typed REST client for /api/v1. The link reads routes from the shared
// contract, so api.projects.update(...) sends PUT /api/v1/projects/{id}.
export const api: JsonifiedClient<ContractRouterClient<typeof contract>> =
  createORPCClient(
    new OpenAPILink(contract, {
      url: () => new URL("/api/v1", window.location.origin).toString(),
    }),
  );

// Defined errors (declared in src/contract/base.ts) carry messages meant
// for users; anything else gets the fallback. To branch on error codes with
// full types, use safe(call) and isDefinedError(error) from @orpc/client.
export function userMessage(error: unknown, fallback: string) {
  return error instanceof ORPCError && error.defined ? error.message : fallback;
}
