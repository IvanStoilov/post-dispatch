import type { Metadata } from "next";
import { ResetPasswordForm } from "../../password-forms";

export const metadata: Metadata = { title: "Choose a new password" };
// Better Auth redirects here with ?token=… or, for a bad link, ?error=INVALID_TOKEN.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token, error } = await searchParams;
  return (
    <ResetPasswordForm
      token={typeof token === "string" && !error ? token : undefined}
    />
  );
}
