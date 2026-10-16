import { headers } from "next/headers";
import { redirect } from "next/navigation";
import AuthForm from "../../auth-form";
import { parseAuthQuery } from "../../auth-query";
import { getAuth } from "@/lib/auth";
import { appPageUrl } from "@/lib/origins";
import { termsService } from "@/domain/terms";

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
  const terms = termsService.current();
  return (
    <AuthForm
      mode="signup"
      oauthQuery={oauthQuery}
      notice={notice}
      terms={{ version: terms.version, hash: terms.hash }}
    />
  );
}
