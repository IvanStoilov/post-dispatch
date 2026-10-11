import { EmailLayout, Paragraph, greeting } from "./_components/email-layout";

export type ResetPasswordProps = { name: string; url: string };
export default function ResetPassword({ name, url }: ResetPasswordProps) {
  return (
    <EmailLayout
      preview="Use this link to choose a new Ramblo password."
      heading="Reset your password"
      action="Choose a new password"
      url={url}
      footer="This link expires in 1 hour and can be used once. If you didn’t ask to reset your password, you can ignore this email; your password won’t change."
    >
      <Paragraph>
        {greeting(name)} we received a request to reset the password for your
        Ramblo account.
      </Paragraph>
    </EmailLayout>
  );
}
ResetPassword.PreviewProps = {
  name: "Ana Ruiz",
  url: "http://localhost:8200/api/auth/reset-password/preview?callbackURL=%2Freset-password",
} satisfies ResetPasswordProps;
