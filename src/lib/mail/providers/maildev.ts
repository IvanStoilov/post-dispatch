import nodemailer from "nodemailer";
import { MailError, type MailProvider } from "../types";

export function maildevProvider(): MailProvider {
  const transport = nodemailer.createTransport({
    host: "localhost",
    port: 1025,
  });

  return {
    name: "maildev",
    async send(mail) {
      const response = await transport.sendMail({
        from: mail.from,
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        ...(mail.replyTo ? { replyTo: mail.replyTo } : {}),
      });

      if (!response.messageId)
        throw new MailError(
          `Maildev rejected the email: ${response.rejectedErrors}`,
          "maildev",
          response.status,
        );
      return { id: response.messageId };
    },
  };
}
