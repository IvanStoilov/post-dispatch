import { appPageUrl } from "@/lib/origins";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import AuthForm from "../../auth-form";
import { parseAuthQuery } from "../../auth-query";
import { currentTerms } from "@/lib/terms";
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
    redirect(appPageUrl());
  const terms = currentTerms();
  return (
    <AuthForm
      mode="signup"
      oauthQuery={oauthQuery}
      notice={notice}
      terms={{ version: terms.version, hash: terms.hash }}
    />
  );
}
