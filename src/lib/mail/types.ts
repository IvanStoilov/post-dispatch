export type MailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
};
export type OutgoingMail = MailMessage & { from: string; replyTo?: string };
// Adding a provider means implementing this and registering it in index.ts.
export type MailProvider = {
  name: string;
  send(mail: OutgoingMail): Promise<{ id?: string }>;
};
export class MailError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly status?: number,
  ) {
    super(message);
  }
}
/** Splits `Name <email@x>` into parts; a bare address has no name. */
export function parseAddress(value: string) {
  const match = value.trim().match(/^(.*?)\s*<([^>]+)>$/);
  return match
    ? {
        name: match[1].replace(/^"|"$/g, "").trim() || undefined,
        email: match[2].trim(),
      }
    : { email: value.trim() };
}
