import { oc } from "@orpc/contract";

// Errors every procedure can return. Declared in the contract so the
// client knows them: isDefinedError(error) narrows to these codes. The
// server translates lib errors into them in one place (server/orpc.ts).
export const errorMap = {
  BAD_REQUEST: { status: 400 },
  UNAUTHORIZED: { status: 401, message: "Sign in to continue" },
  FORBIDDEN: { status: 403 },
  NOT_FOUND: { status: 404 },
  CONFLICT: { status: 409 },
  TOO_MANY_REQUESTS: { status: 429 },
  BAD_GATEWAY: { status: 502 },
};
export const base = oc.errors(errorMap);
