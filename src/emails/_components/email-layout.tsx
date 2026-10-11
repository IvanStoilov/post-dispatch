import { appOrigin } from "../../lib/origins";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Tailwind,
  Text,
  pixelBasedPreset,
  type TailwindConfig,
} from "react-email";

// Mirrors the app tokens in src/app/globals.css. Emails need pixel units,
// so the preset swaps Tailwind's rem scale for px.
const config: TailwindConfig = {
  presets: [pixelBasedPreset],
  theme: {
    extend: {
      colors: {
        background: "#f5f7fa",
        foreground: "#172b36",
        primary: "#087f73",
        "primary-foreground": "#ffffff",
        muted: "#637480",
        border: "#dfe6eb",
      },
    },
  },
};
function appUrl() {
  return appOrigin();
}
export function EmailLayout({
  preview,
  heading,
  children,
  action,
  url,
  footer,
}: {
  preview: string;
  heading: string;
  children: React.ReactNode;
  action: string;
  url: string;
  footer: string;
}) {
  return (
    <Html lang="en">
      <Tailwind config={config}>
        <Head />
        <Preview>{preview}</Preview>
        <Body className="bg-background px-4 py-8 font-sans text-foreground">
          <Container className="max-w-[480px] rounded-[12px] bg-white p-8">
            <Img
              src={`${appUrl()}/brand/logo.png`}
              alt="PostDispatch"
              width="124"
              height="24"
            />
            <Heading className="mt-8 mb-3 text-[22px] leading-[1.3] font-semibold">
              {heading}
            </Heading>
            {children}
            <Section className="my-6">
              <Button
                href={url}
                className="rounded-[8px] bg-primary px-5 py-3 text-[15px] font-semibold text-primary-foreground"
              >
                {action}
              </Button>
            </Section>
            <Text className="text-[13px] leading-[1.6] text-muted">
              If the button doesn’t work, paste this link into your browser:
              <br />
              <Link href={url} className="break-all text-foreground">
                {url}
              </Link>
            </Text>
            <Hr className="my-4 border-border" />
            <Text className="m-0 text-[13px] leading-[1.6] text-muted">
              {footer}
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
export function Paragraph({ children }: { children: React.ReactNode }) {
  return (
    <Text className="m-0 text-[15px] leading-[1.6] text-foreground">
      {children}
    </Text>
  );
}
export function greeting(name: string) {
  const first = name.trim().split(/\s+/)[0];
  return first ? `Hi ${first},` : "Hi,";
}
