import { logger } from "../logger";
import { consoleProvider } from "./providers/console";
import { maildevProvider } from "./providers/maildev";
import { resendProvider } from "./providers/resend";
import { sendgridProvider } from "./providers/sendgrid";
import type { MailMessage, MailProvider } from "./types";

export type { MailMessage, MailProvider } from "./types";
export { MailError } from "./types";

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for MAIL_PROVIDER`);
  return value;
}
// Switch providers with MAIL_PROVIDER; each reads its own API key.
const providers: Record<string, () => MailProvider> = {
  resend: () => resendProvider(requireEnv("RESEND_API_KEY")),
  sendgrid: () => sendgridProvider(requireEnv("SENDGRID_API_KEY")),
  console: () => {
    if (process.env.NODE_ENV === "production")
      throw new Error("MAIL_PROVIDER=console cannot be used in production");
    return consoleProvider();
  },
  maildev: () => maildevProvider(),
};
export function mailProvider(): MailProvider {
  const name =
    process.env.MAIL_PROVIDER ||
    (process.env.NODE_ENV === "production" ? "" : "console");
  if (!name)
    throw new Error(
      `Set MAIL_PROVIDER to one of: ${Object.keys(providers).join(", ")}`,
    );
  const create = providers[name];
  if (!create)
    throw new Error(
      `Unknown MAIL_PROVIDER "${name}". Use one of: ${Object.keys(providers).join(", ")}`,
    );
  return create();
}
export function mailFrom() {
  if (process.env.MAIL_FROM) return process.env.MAIL_FROM;
  if (process.env.NODE_ENV === "production")
    throw new Error(
      "MAIL_FROM is required, e.g. PostDispatch <hello@example.com>",
    );
  return "PostDispatch <noreply@localhost>";
}
// Callers such as Better Auth may swallow the error, so every failure,
// including missing configuration, is logged here with its reason.
export async function sendMail(
  message: MailMessage | Promise<MailMessage>,
  kind: string,
) {
  let provider: MailProvider | undefined;
  try {
    const rendered = await message;
    provider = mailProvider();
    const { id } = await provider.send({
      ...rendered,
      from: mailFrom(),
      ...(process.env.MAIL_REPLY_TO
        ? { replyTo: process.env.MAIL_REPLY_TO }
        : {}),
    });
    logger.info("mail.sent", { provider: provider.name, kind, messageId: id });
  } catch (error) {
    logger.error("mail.failed", { provider: provider?.name, kind, error });
    throw error;
  }
}
