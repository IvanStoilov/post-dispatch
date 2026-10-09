import type { AuthNotice } from "./auth-form";
type SearchParams = Record<string, string | string[] | undefined>;
// Separates the signed OAuth continuation (it carries `sig`) from our own
// notice flags, which must not be forwarded or the signature breaks.
export function parseAuthQuery(values: SearchParams) {
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(values))
    for (const value of Array.isArray(v) ? v : v ? [v] : [])
      query.append(k, value);
  const notice: AuthNotice | undefined = query.has("verified")
    ? query.has("error")
      ? "verification-failed"
      : "verified"
    : query.has("reset")
      ? "password-reset"
      : undefined;
  for (const key of ["verified", "error", "reset"]) query.delete(key);
  const oauthQuery = query.has("sig") ? query.toString() : undefined;
  return { oauthQuery, notice };
}
