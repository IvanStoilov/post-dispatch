import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import AuthForm from "../auth-form";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const values = await searchParams;
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(values))
    for (const value of Array.isArray(v) ? v : v ? [v] : [])
      query.append(k, value);
  const oauthQuery = query.has("sig") ? query.toString() : undefined;
  if (
    !oauthQuery &&
    (await getAuth().api.getSession({ headers: await headers() }))
  )
    redirect("/");
  return <AuthForm mode="signup" oauthQuery={oauthQuery} />;
}
