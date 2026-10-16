import { render } from "react-email";
import type { ReactElement } from "react";
import { brand } from "../brand";
import ResetPassword from "../../emails/reset-password";
import VerifyEmail from "../../emails/verify-email";
import type { MailMessage } from "./types";

// Templates live in src/emails as React Email components; preview them with
// `pnpm email:dev`. Every email gets an HTML and a plain-text part.
async function message(
  to: string,
  subject: string,
  email: ReactElement,
): Promise<MailMessage> {
  const [html, text] = await Promise.all([
    render(email),
    render(email, { plainText: true }),
  ]);
  return { to, subject, html, text };
}
export function verificationEmail(input: {
  to: string;
  name: string;
  url: string;
}) {
  return message(
    input.to,
    `Confirm your email for ${brand.name}`,
    <VerifyEmail name={input.name} url={input.url} />,
  );
}
export function passwordResetEmail(input: {
  to: string;
  name: string;
  url: string;
}) {
  return message(
    input.to,
    `Reset your ${brand.name} password`,
    <ResetPassword name={input.name} url={input.url} />,
  );
}
