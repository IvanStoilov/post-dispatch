import type { MailProvider } from "../types";

// Development only: prints the email (including one-time links) to stdout
// instead of sending it. The structured logger would strip link tokens.
export function consoleProvider(): MailProvider {
  return {
    name: "console",
    async send(mail) {
      console.info(
        `\n--- Email (not sent; MAIL_PROVIDER=console) ---\nTo: ${mail.to}\nFrom: ${mail.from}\nSubject: ${mail.subject}\n\n${mail.text}\n-----------------------------------------------\n`,
      );
      return {};
    },
  };
}
