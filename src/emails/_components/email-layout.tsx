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
import { brand } from "../../lib/brand";
import { appOrigin } from "../../lib/origins";

// Mirrors the app tokens in src/app/globals.css. Emails need pixel units,
// so the preset swaps Tailwind's rem scale for px.
const config: TailwindConfig = {
  presets: [pixelBasedPreset],
  theme: {
    extend: {
      // Most email clients lack these fonts; the fallbacks keep it tidy.
      fontFamily: {
        sans: ["Figtree", "Helvetica", "Arial", "sans-serif"],
        display: ["Fredoka", "Nunito", "Helvetica", "Arial", "sans-serif"],
      },
      colors: {
        background: "#FBF7EE",
        foreground: "#1B2620",
        primary: "#FFC531",
        "primary-foreground": "#1B2620",
        muted: "#4A5A50",
        border: "#E9E1CF",
        link: "#225C93",
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
          <Container className="max-w-[480px] rounded-[20px] bg-white p-8">
            <Img
              src={`${appUrl()}/brand/logo.png`}
              alt={brand.name}
              width="140"
              height="32"
            />
            <Heading className="mt-8 mb-3 font-display text-[24px] leading-[30px] font-semibold">
              {heading}
            </Heading>
            {children}
            <Section className="my-6">
              <Button
                href={url}
                className="rounded-full bg-primary px-6 py-3 text-[16px] font-semibold text-primary-foreground"
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
            <Text className="mt-4 mb-0 text-[13px] text-muted">
              {brand.tagline}{" "}
              <Link href={`mailto:${brand.email}`} className="text-foreground">
                {brand.email}
              </Link>
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
