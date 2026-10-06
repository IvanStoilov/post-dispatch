import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { oauthConsentContext } from "@/lib/oauth";
import ConsentForm from "./consent-form";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params))
    for (const value of Array.isArray(v) ? v : v ? [v] : [])
      query.append(k, value);
  const h = await headers();
  const session = await getAuth().api.getSession({ headers: h });
  if (!session) redirect(`/signin?${query}`);
  let context: Awaited<ReturnType<typeof oauthConsentContext>> | undefined;
  let error = "Invalid connection request";
  try {
    context = await oauthConsentContext(
      query.toString(),
      session.user.id,
      new Headers(h),
    );
  } catch (e) {
    if (e instanceof Error) error = e.message;
  }
  if (!context)
    return (
      <main className="auth-shell oauth-shell">
        <section className="auth-card">
          <h1>Unable to connect</h1>
          <p>{error}</p>
        </section>
      </main>
    );
  return (
    <ConsentForm
      query={query.toString()}
      projectName={context.project.name}
      clientName={context.clientName}
      redirectHost={context.redirectHost}
      scopes={context.scopes}
    />
  );
}
