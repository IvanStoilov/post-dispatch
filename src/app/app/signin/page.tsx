import { headers } from "next/headers";
import { redirect } from "next/navigation";
import AuthForm from "../../auth-form";
import { parseAuthQuery } from "../../auth-query";
import { getAuth } from "@/lib/auth";
import { appPageUrl } from "@/lib/origins";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { oauthQuery, notice } = parseAuthQuery(await searchParams);
  if (
    !oauthQuery &&
    (await getAuth().api.getSession({ headers: await headers() }))
  ) {
    redirect(appPageUrl());
  }
  return <AuthForm mode="signin" oauthQuery={oauthQuery} notice={notice} />;
}
