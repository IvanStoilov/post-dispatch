import Link from "next/link";
import { ArrowRight, Check, FileText, Sparkles, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";
import { channelIcons } from "@/components/channel-catalog";
import { platforms, channelLabels } from "@/lib/connectors/catalog";
import { SiteShell } from "./site-shell";
const faq = [
  [
    "Does the AI publish for me?",
    "Your assistant creates drafts. You review the text and media, then click Publish in PostDispatch. Assistants cannot publish through our MCP tools.",
  ],
  [
    "Can I receive a new draft every day?",
    "Yes, with an external scheduled AI workflow connected to your project. PostDispatch receives the drafts; daily generation is configured in your automation tool. The setup guide explains how.",
  ],
  [
    "Which accounts can I connect?",
    "Facebook Pages, Instagram Business or Creator accounts, and LinkedIn personal profiles or eligible company Pages. Availability depends on each network’s permissions and app approval.",
  ],
  [
    "Can I use my own images and videos?",
    "Yes. Add up to 10 images or one video to a draft. Your assistant can submit supported file uploads or HTTPS media URLs. Imported media is saved in private storage.",
  ],
];
export function Landing() {
  return (
    <SiteShell>
      <main id="main-content" tabIndex={-1}>
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
          <div className="flex flex-col items-start gap-7">
            <Badge variant="secondary">AI drafts. Human approval.</Badge>
            <h1 className="text-hero font-semibold">
              Your AI drafts.
              <br />
              Your final say.
            </h1>
            <p className="max-w-lg text-lg leading-relaxed text-muted-foreground">
              Turn ideas from ChatGPT and Claude into social posts. Keep every
              brand’s drafts together, make them your own, and publish when
              you’re ready.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button size="lg" asChild>
                <Link href="/signup">
                  Create your workspace
                  <ArrowRight data-icon="inline-end" aria-hidden="true" />
                </Link>
              </Button>
              <Button variant="outline" size="lg" asChild>
                <Link href="/guide">See the setup guide</Link>
              </Button>
            </div>
            <ul
              aria-label="Supported social networks"
              className="flex flex-wrap gap-x-5 gap-y-3 pt-2 text-sm text-muted-foreground"
            >
              {platforms.map((p) => {
                const Icon = channelIcons[p];
                return (
                  <li key={p} className="flex items-center gap-2">
                    <Icon className="size-4" aria-hidden="true" />
                    {channelLabels[p]}
                  </li>
                );
              })}
            </ul>
          </div>
          <figure className="flex min-w-0 flex-col gap-4 rounded-3xl bg-secondary p-5 sm:p-8">
            <figcaption className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium">Your draft inbox</span>
              <span className="text-muted-foreground">Example preview</span>
            </figcaption>
            <Card>
              <CardHeader>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <Badge variant="outline">
                    <Sparkles aria-hidden="true" />
                    AI draft
                  </Badge>
                  <Badge variant="secondary">Awaiting your review</Badge>
                </div>
                <CardTitle>A little progress, every day</CardTitle>
                <CardDescription>Your brand’s next update</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                <svg
                  viewBox="0 0 420 180"
                  role="img"
                  aria-label="Illustration of three growing plants"
                  className="aspect-[7/3] w-full rounded-lg bg-muted"
                >
                  <path
                    d="M70 148h280"
                    stroke="var(--border)"
                    strokeWidth="2"
                  />
                  <g fill="var(--primary)">
                    <path d="M100 146V92h4v54zM102 107C73 107 74 82 74 82s28-1 28 25M103 96c0-25 28-25 28-25s1 25-28 25M208 146V63h4v83zM210 105c-40 0-40-34-40-34s40-1 40 34M211 83c0-33 36-33 36-33s1 33-36 33M316 146V38h4v108zM318 88c-44 0-44-38-44-38s44-1 44 38M319 67c0-40 43-40 43-40s1 40-43 40" />
                  </g>
                </svg>
                <p className="text-sm leading-7 text-muted-foreground">
                  Big ideas grow from small, consistent steps. Here’s a look at
                  what we’ve been working on this week.
                </p>
                <div className="flex flex-wrap gap-2">
                  {platforms.map((p) => (
                    <Badge variant="outline" key={p}>
                      {channelLabels[p]}
                    </Badge>
                  ))}
                </div>
              </CardContent>
              <CardFooter className="justify-between gap-4">
                <span className="flex items-center gap-2 text-sm">
                  <Check className="size-4 text-primary" aria-hidden="true" />
                  You approve every post
                </span>
                <Send
                  className="size-4 text-muted-foreground"
                  aria-hidden="true"
                />
              </CardFooter>
            </Card>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Edit the caption. Check the media. Choose when it goes live.
            </p>
          </figure>
        </section>
        <Separator />
        <section
          id="workflow"
          className="mx-auto flex max-w-6xl scroll-mt-8 flex-col gap-10 px-5 py-16 sm:px-8 sm:py-20"
        >
          <div className="flex max-w-xl flex-col gap-4">
            <h2 className="text-display font-semibold">
              From conversation to publication.
            </h2>
            <p className="text-muted-foreground">
              Give your assistant a place to send its work, and give yourself a
              place to finish it.
            </p>
          </div>
          <ol className="grid gap-8 md:grid-cols-3">
            {[
              {
                title: "Connect your project",
                text: "Create a workspace for your brand, connect its social accounts, and authorize ChatGPT, Claude, or another MCP client.",
                Icon: Sparkles,
              },
              {
                title: "Make the draft yours",
                text: "Receive AI drafts in one inbox. Refine the words, arrange the images, or add a video before approving.",
                Icon: FileText,
              },
              {
                title: "Publish with a click",
                text: "Send your approved post to the selected channels and see the delivery result for each network.",
                Icon: Send,
              },
            ].map(({ title, text, Icon }, i) => (
              <li key={title} className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-full border text-sm font-semibold">
                    {i + 1}
                  </span>
                  <Icon className="size-5 text-primary" aria-hidden="true" />
                </div>
                <h3 className="text-xl font-semibold">{title}</h3>
                <p className="leading-7 text-muted-foreground">{text}</p>
              </li>
            ))}
          </ol>
        </section>
        <section className="bg-background">
          <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-2">
            <div className="flex flex-col gap-5">
              <h2 className="text-display font-semibold">
                A daily rhythm for your ideas.
              </h2>
              <p className="max-w-lg leading-7 text-muted-foreground">
                Use a scheduled AI workflow to prepare a fresh draft each day.
                PostDispatch keeps it ready for your review, alongside posts you
                create yourself.
              </p>
              <Button variant="outline" className="w-fit" asChild>
                <Link href="/guide#daily-drafts">
                  Set up daily drafts
                  <ArrowRight data-icon="inline-end" aria-hidden="true" />
                </Link>
              </Button>
            </div>
            <div className="flex flex-col justify-center gap-6">
              <div className="flex flex-col gap-2">
                <h3 className="text-xl font-semibold">
                  One project for each brand
                </h3>
                <p className="leading-7 text-muted-foreground">
                  Keep accounts, drafts, and assistant access scoped to the
                  right project.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <h3 className="text-xl font-semibold">
                  Your media, kept private
                </h3>
                <p className="leading-7 text-muted-foreground">
                  Draft media is stored privately and shared with the selected
                  networks when you publish.
                </p>
              </div>
            </div>
          </div>
        </section>
        <section className="mx-auto grid max-w-6xl gap-8 px-5 py-16 sm:px-8 sm:py-20 md:grid-cols-[1fr_1.5fr]">
          <h2 className="text-display font-semibold">Before you start.</h2>
          <Accordion type="single" collapsible>
            {faq.map(([question, answer], i) => (
              <AccordionItem key={question} value={`faq-${i}`}>
                <AccordionTrigger>{question}</AccordionTrigger>
                <AccordionContent>{answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>
        <section className="bg-secondary">
          <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-5 py-12 sm:px-8 md:flex-row md:items-center">
            <div className="flex flex-col gap-2">
              <h2 className="text-page font-semibold">
                Put your next idea in motion.
              </h2>
              <p className="text-muted-foreground">
                Start with a project and your first draft.
              </p>
            </div>
            <Button size="lg" asChild>
              <Link href="/signup">
                Get started
                <ArrowRight data-icon="inline-end" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </section>
      </main>
    </SiteShell>
  );
}
