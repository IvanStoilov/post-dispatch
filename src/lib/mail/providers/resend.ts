import { MailError, type MailProvider } from "../types";

export function resendProvider(apiKey: string): MailProvider {
  return {
    name: "resend",
    async send(mail) {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: mail.from,
          to: [mail.to],
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
          ...(mail.replyTo ? { reply_to: mail.replyTo } : {}),
        }),
        signal: AbortSignal.timeout(10_000),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new MailError(
          `Resend rejected the email: ${body.message || response.statusText}`,
          "resend",
          response.status,
        );
      }
      return { id: body.id };
    },
  };
}
