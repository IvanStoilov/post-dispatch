import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import AuthForm from "../auth-form";
import { parseAuthQuery } from "../auth-query";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { oauthQuery, notice } = parseAuthQuery(await searchParams);
  if (
    !oauthQuery &&
    (await getAuth().api.getSession({ headers: await headers() }))
  )
    redirect("/");
  return <AuthForm mode="signup" oauthQuery={oauthQuery} notice={notice} />;
}
