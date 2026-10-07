import Link from "next/link";
import type { Metadata } from "next";
import { Mail, BookOpen } from "lucide-react";
import { PageIntro, DocumentSection } from "@/components/public/site-shell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { site } from "@/lib/public-site";
export const metadata: Metadata = {
  title: "Support | PostDispatch",
  description:
    "Get help with your PostDispatch project, assistant connections, and publishing.",
  alternates: { canonical: "/support" },
};
export default function SupportPage() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-5 py-12 sm:px-8 sm:py-16"
    >
      <PageIntro
        title="Let’s get you unstuck."
        description="Help with your workspace, connected accounts, and posts. Reach the team directly by email."
      />
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Email support</CardTitle>
            <CardDescription>
              Account help, connection issues, and publishing questions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <a
              className="document-link break-all"
              href={`mailto:${site.email}`}
            >
              {site.email}
            </a>
          </CardContent>
          <CardFooter>
            <Button asChild>
              <a href={`mailto:${site.email}?subject=PostDispatch%20support`}>
                <Mail data-icon="inline-start" aria-hidden="true" />
                Email the team
              </a>
            </Button>
          </CardFooter>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Start with the guide</CardTitle>
            <CardDescription>
              Connect your assistant and prepare your first draft.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-7 text-muted-foreground">
              Includes a daily automation walkthrough, an example prompt, and
              common fixes.
            </p>
          </CardContent>
          <CardFooter>
            <Button variant="outline" asChild>
              <Link href="/guide">
                <BookOpen data-icon="inline-start" aria-hidden="true" />
                Read the setup guide
              </Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
      <DocumentSection id="reporting" title="What to include">
        <p>
          Tell us your account email, the project name, the network involved,
          what you expected, and what happened. A post ID, approximate time and
          timezone, and a screenshot of the error help us investigate.
        </p>
        <p>
          Do not send passwords, access tokens, authorization codes, or private
          media URLs. Remove these from screenshots and logs before sharing.
        </p>
      </DocumentSection>
      <DocumentSection id="delivery" title="If a publication is interrupted">
        <p>
          Check the selected social accounts before submitting again. One
          network may have accepted a post even if another failed. PostDispatch
          keeps delivery results per channel; uncertain deliveries require
          review to avoid duplicate posts.
        </p>
      </DocumentSection>
      <DocumentSection id="privacy" title="Privacy and account requests">
        <p>
          For access, correction, or deletion requests, use the same email
          address with “PostDispatch privacy request” in the subject. See the{" "}
          <Link className="document-link" href="/privacy">
            privacy policy
          </Link>{" "}
          or{" "}
          <Link className="document-link" href="/data-deletion">
            account deletion instructions
          </Link>
          .
        </p>
      </DocumentSection>
    </main>
  );
}
