import { EmailLayout, Paragraph, greeting } from "./_components/email-layout";

export type VerifyEmailProps = { name: string; url: string };
export default function VerifyEmail({ name, url }: VerifyEmailProps) {
  return (
    <EmailLayout
      preview="Confirm your email to finish setting up PostDispatch."
      heading="Confirm your email"
      action="Confirm email"
      url={url}
      footer="This link expires in 24 hours. If you didn’t create a PostDispatch account, you can ignore this email."
    >
      <Paragraph>
        {greeting(name)} confirm this is your email address to finish setting up
        your PostDispatch account.
      </Paragraph>
    </EmailLayout>
  );
}
VerifyEmail.PreviewProps = {
  name: "Ana Ruiz",
  url: "http://localhost:8200/api/auth/verify-email?token=preview&callbackURL=%2Fsignin%3Fverified%3D1",
} satisfies VerifyEmailProps;
