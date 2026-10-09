import { MailError, parseAddress, type MailProvider } from "../types";

export function sendgridProvider(apiKey: string): MailProvider {
  return {
    name: "sendgrid",
    async send(mail) {
      const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: mail.to }] }],
          from: parseAddress(mail.from),
          ...(mail.replyTo ? { reply_to: parseAddress(mail.replyTo) } : {}),
          subject: mail.subject,
          // SendGrid requires text/plain before text/html.
          content: [
            { type: "text/plain", value: mail.text },
            { type: "text/html", value: mail.html },
          ],
          // Click tracking rewrites links, which would leak one-time tokens
          // through SendGrid's redirector.
          tracking_settings: {
            click_tracking: { enable: false, enable_text: false },
          },
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const reason = body.errors?.[0]?.message || response.statusText;
        throw new MailError(
          `SendGrid rejected the email: ${reason}`,
          "sendgrid",
          response.status,
        );
      }
      return { id: response.headers.get("x-message-id") ?? undefined };
    },
  };
}
