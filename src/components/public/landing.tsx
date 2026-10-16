import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  Check,
  Layers,
  MessageCircle,
  PencilLine,
  Send,
  ShieldCheck,
} from "lucide-react";
import { CopyText } from "./copy-text";
import { PlatformMark, platformNames } from "./platform-marks";
import { appPageUrl } from "@/lib/origins";
import { brand } from "@/lib/brand";

// Built from design/ramblo-homepage (desktop light, desktop dark, phone).
// Sizes and spacing follow the design; colours come from the theme tokens,
// so the dark artboard is the same markup under prefers-color-scheme: dark.
const gutter = "px-[clamp(16px,4vw,40px)]";
const sectionY = "py-[clamp(64px,8vw,112px)]";
const display = "font-display font-semibold text-balance";
const h2 = `${display} m-0 text-[clamp(32px,4vw,48px)] leading-[1.1]`;
const overline = "text-overline text-muted-foreground";
const lead = "text-body-l text-muted-foreground";
const pill =
  "inline-flex items-center gap-2 rounded-full font-semibold no-underline transition-colors duration-150";
const sunButton = `${pill} bg-primary text-primary-foreground hover:bg-primary-hover`;
const outlineButton = `${pill} border-[1.5px] border-input text-foreground hover:bg-sunken`;
const mcpUrl = "https://app.ramblo.io/api/mcp";

export function Landing() {
  const signup = appPageUrl("/signup");
  return (
    <main id="main-content" tabIndex={-1} className="outline-none">
      <Hero signup={signup} />
      <NetworksStrip />
      <HowItWorks />
      <Networks />
      <Agents />
      <section
        id="start"
        className={`mx-auto max-w-[1200px] ${gutter} pb-[clamp(64px,8vw,112px)]`}
      >
        <div className="flex flex-wrap items-center justify-between gap-8 rounded-xl bg-primary px-[clamp(24px,5vw,64px)] py-[clamp(40px,6vw,80px)] text-primary-foreground">
          <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-3">
            <h2
              className={`${display} m-0 text-[clamp(36px,4.6vw,56px)] leading-[1.05]`}
            >
              Your next post is one conversation away.
            </h2>
            <p className="m-0 text-body-l">
              Connect Ramblo to your agent and publish your first post today.
            </p>
          </div>
          {/* Ink on sun in both themes, as in the design. */}
          <Link
            href={signup}
            className={`${pill} min-h-14 bg-pine-900 px-7 text-[17px] text-oat-50 hover:bg-pine-700`}
          >
            Connect your agent
            <ArrowRight className="size-5" aria-hidden="true" />
          </Link>
        </div>
      </section>
    </main>
  );
}

function Hero({ signup }: { signup: string }) {
  return (
    <section
      id="top"
      className={`mx-auto flex max-w-[1200px] flex-wrap items-center gap-[clamp(40px,5vw,72px)] ${gutter} py-[clamp(48px,7vw,96px)]`}
    >
      <div className="relative flex min-w-0 flex-[1_1_460px] flex-col gap-6">
        <div className="inline-flex items-center gap-2.5 self-start rounded-full border bg-card py-1.5 pr-4 pl-2 text-label">
          <span className="inline-block size-5 rounded-full bg-primary" />
          {brand.tagline}
        </div>
        <h1
          className={`${display} m-0 text-[clamp(44px,5.6vw,72px)] leading-[1.02] tracking-[-0.01em]`}
        >
          Talk it through. Ramblo posts it.
        </h1>
        <p className={`m-0 max-w-[34em] ${lead}`}>
          Tell ChatGPT, Claude or any MCP agent what&apos;s on your mind. Ramblo
          turns it into ready-to-go posts for LinkedIn, X and Threads, and
          publishes them the moment you say so.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={signup}
            className={`${sunButton} min-h-13 px-6 text-[17px] shadow-[0_2px_8px_0_#00000033]`}
          >
            Connect your agent
            <ArrowRight className="size-5" aria-hidden="true" />
          </Link>
          <Link
            href="#how"
            className={`${outlineButton} min-h-13 px-6 text-[17px]`}
          >
            See how it works
          </Link>
        </div>
        <ul className="m-0 flex list-none flex-wrap gap-x-6 gap-y-2 p-0 text-body-s text-muted-foreground">
          {["Works with any MCP agent", "You approve every post"].map(
            (text) => (
              <li key={text} className="inline-flex items-center gap-1.5">
                <Check className="size-4 text-success" aria-hidden="true" />
                {text}
              </li>
            ),
          )}
        </ul>
      </div>

      <div
        className="flex min-w-0 flex-[1_1_440px] flex-col gap-4 rounded-xl bg-primary p-[clamp(20px,3vw,36px)]"
        aria-label="Example: a conversation with your agent becomes a LinkedIn post"
        role="img"
      >
        <div className="flex max-w-[420px] flex-col gap-3 rounded-lg bg-card p-5 text-foreground shadow-md">
          <div className="flex items-center gap-2 text-caption font-semibold text-muted-foreground">
            <MessageCircle className="size-4" aria-hidden="true" />
            Chat with your agent
          </div>
          <Bubble from="you">
            We raised prices 30% last month. Lost 2 customers, gained 11. Make
            that a LinkedIn post and a short one for X.
          </Bubble>
          <div className="inline-flex items-center gap-1.5 self-start rounded-full bg-sunken px-3 py-1.5 font-mono text-tool text-muted-foreground">
            <Check className="size-3.5 text-success" aria-hidden="true" />
            ramblo.create_post · 2 drafts
          </div>
          <Bubble from="agent">
            Both drafts are in Ramblo. Want me to post them now?
          </Bubble>
          <Bubble from="you">Post them.</Bubble>
        </div>

        <div className="flex w-full max-w-[400px] flex-col gap-3 self-end rounded-lg bg-card p-5 text-foreground shadow-lg">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-blush-400 text-body-s font-bold text-pine-900">
              MO
            </div>
            <div className="flex min-w-0 grow flex-col">
              <span className="text-[15px] leading-5 font-semibold">
                Maya Ortiz
              </span>
              <span className="text-[13px] leading-[18px] text-subtle-foreground">
                Founder at Fieldnote · now
              </span>
            </div>
            <PlatformMark
              platform="LinkedIn"
              title="LinkedIn"
              className="size-[22px] shrink-0 text-info"
            />
          </div>
          <p className="m-0 text-[15px] leading-[22px] whitespace-pre-line">
            {`We raised prices 30% last month.
We lost 2 customers. We gained 11.

Three things I'd tell any founder who's scared to charge more:`}
          </p>
          <div className="flex items-center justify-between gap-3 border-t pt-3">
            <StatusBadge tone="success" icon={Check}>
              Posted to LinkedIn and X
            </StatusBadge>
            <span className="inline-flex items-center gap-1.5 text-caption text-subtle-foreground">
              {/* eslint-disable-next-line @next/next/no-img-element -- tiny static brand icon */}
              <img src="/brand/app-icon.svg" alt="" className="block size-4" />
              with Ramblo
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function NetworksStrip() {
  return (
    <section aria-label="Supported networks" className="border-y bg-card">
      <div
        className={`mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-x-8 gap-y-4 ${gutter} py-6`}
      >
        <span className="text-label text-muted-foreground">
          Posts straight to
        </span>
        <ul className="m-0 flex list-none flex-wrap items-center gap-x-8 gap-y-4 p-0 text-body font-semibold">
          {platformNames.map((name) => (
            <li key={name} className="inline-flex items-center gap-2">
              <PlatformMark platform={name} className="size-6" />
              {name}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section
      id="how"
      className={`mx-auto flex max-w-[1200px] scroll-mt-4 flex-col gap-12 ${gutter} ${sectionY}`}
    >
      <div className="flex max-w-[720px] flex-col gap-3">
        <div className={overline}>HOW IT WORKS</div>
        <h2 className={h2}>From a conversation to a published post</h2>
        <p className={`m-0 ${lead}`}>
          Ramblo sits between your AI agent and your social accounts. You do the
          talking; it does the posting.
        </p>
      </div>
      <ol className="m-0 flex list-none flex-wrap gap-6 p-0">
        <Step
          number={1}
          title="Connect your agent"
          body="Add Ramblo as a connector in ChatGPT, Claude or any MCP client. It's one URL."
        >
          <div className="mt-auto flex items-center justify-between gap-3 rounded-sm bg-sunken px-3.5 py-3 font-mono text-code">
            <span className="min-w-0 truncate">{mcpUrl}</span>
            <CopyText text={mcpUrl} label="Copy connector URL" />
          </div>
        </Step>
        <Step
          number={2}
          title="Talk it through"
          body="On a walk, between meetings, wherever. Tell your agent what you want to say, who it's for and where it should go."
        >
          <div className="mt-auto flex flex-col gap-2" aria-hidden="true">
            <Bubble from="you" small>
              Post this on LinkedIn tomorrow morning.
            </Bubble>
            <Bubble from="agent" small>
              Scheduled for 9:00. Want an X version too?
            </Bubble>
          </div>
        </Step>
        <Step
          number={3}
          title="Review and post"
          body="Check each draft, then post it now or schedule it. Ramblo publishes to every network you picked."
        >
          <div className="mt-auto flex flex-wrap gap-2">
            <Link
              href="#start"
              className={`${sunButton} min-h-11 gap-1.5 px-[18px] text-[15px]`}
            >
              <Send className="size-4" aria-hidden="true" />
              Post now
            </Link>
            <Link
              href="#start"
              className={`${outlineButton} min-h-11 gap-1.5 px-[18px] text-[15px]`}
            >
              <CalendarClock className="size-4" aria-hidden="true" />
              Schedule
            </Link>
          </div>
        </Step>
      </ol>
    </section>
  );
}

function Networks() {
  return (
    <section id="networks" className="scroll-mt-4 border-y bg-card">
      <div
        className={`mx-auto flex max-w-[1200px] flex-wrap items-center gap-[clamp(40px,5vw,72px)] ${gutter} ${sectionY}`}
      >
        <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-6">
          <div className="flex flex-col gap-3">
            <div className={overline}>ONE IDEA, EVERY NETWORK</div>
            <h2 className={h2}>Shaped for wherever it&apos;s going</h2>
            <p className={`m-0 ${lead}`}>
              Ramblo adapts each draft to its network: a fuller story for
              LinkedIn, a tight take for X, a casual note for Threads.
            </p>
          </div>
          <ul className="m-0 flex list-none flex-col gap-5 p-0">
            <Feature
              icon={ShieldCheck}
              title="You approve every post"
              body="Nothing goes live until you say so, from your agent or the Ramblo app."
            />
            <Feature
              icon={CalendarClock}
              title="Post now or schedule it"
              body="Pick a time for each network, or send it out right away."
            />
            <Feature
              icon={Layers}
              title="All your accounts in one place"
              body="Connect your networks once, then choose where each post goes."
            />
          </ul>
        </div>
        <div
          className="flex min-w-0 flex-[1.2_1_480px] flex-col gap-4"
          aria-label="Example drafts for LinkedIn, X and Threads"
          role="img"
        >
          <PreviewPost
            platform="LinkedIn"
            status={
              <StatusBadge tone="success" icon={Check}>
                Posted
              </StatusBadge>
            }
          >
            {`We raised prices 30% last month. We lost 2 customers and gained 11.

Three things I learned about charging what you're worth, and why I wish I'd done it a year earlier.`}
          </PreviewPost>
          <PreviewPost
            platform="X"
            status={
              <StatusBadge tone="info" icon={CalendarClock}>
                Scheduled · Tue 9:00
              </StatusBadge>
            }
          >
            Raised prices 30%. Lost 2 customers, gained 11. Best decision we
            made this year.
          </PreviewPost>
          <PreviewPost
            platform="Threads"
            status={
              <StatusBadge tone="warning" icon={PencilLine}>
                Draft
              </StatusBadge>
            }
          >
            Real talk: we were nervous about raising prices. Did it anyway. Nine
            more customers than last month.
          </PreviewPost>
        </div>
      </div>
    </section>
  );
}

function Agents() {
  return (
    <section
      id="agents"
      className={`mx-auto max-w-[1200px] scroll-mt-4 ${gutter} ${sectionY}`}
    >
      <div className="flex flex-wrap items-center gap-10 rounded-xl bg-inverse p-[clamp(28px,5vw,64px)] text-inverse-foreground">
        <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-5">
          <div className="text-overline text-inverse-muted">
            BRING YOUR OWN AGENT
          </div>
          <h2 className={h2}>Works with the agent you already use</h2>
          <p className="m-0 text-body-l text-inverse-muted">
            Ramblo is an MCP server. Add it to ChatGPT, Claude or any agent that
            supports MCP, and posting becomes something your agent can do.
            There&apos;s no new app to learn.
          </p>
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {["ChatGPT", "Claude", "Any MCP client"].map((agent) => (
              <li
                key={agent}
                className="rounded-full border-[1.5px] border-inverse-muted px-4 py-2 text-label"
              >
                {agent}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-4 rounded-lg bg-inverse-sunken p-6">
          <div className="font-mono text-tool text-inverse-muted">
            Connector config
          </div>
          <pre className="m-0 overflow-x-auto font-mono text-[14px] leading-[22px]">
            {`{
  "mcpServers": {
    "ramblo": {
      "url": `}
            <span className="text-code-accent">&quot;{mcpUrl}&quot;</span>
            {`
    }
  }
}`}
          </pre>
          <div className="h-px bg-inverse-muted opacity-35" />
          <div className="font-mono text-tool text-inverse-muted">
            Tools your agent gets
          </div>
          <ul className="m-0 flex list-none flex-col gap-2 p-0 font-mono text-code">
            {[
              "ramblo.create_post",
              "ramblo.schedule_post",
              "ramblo.list_accounts",
            ].map((tool) => (
              <li key={tool} className="inline-flex items-center gap-2.5">
                <span className="size-2 shrink-0 rounded-full bg-primary" />
                {tool}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function Bubble({
  from,
  small,
  children,
}: {
  from: "you" | "agent";
  small?: boolean;
  children: React.ReactNode;
}) {
  const size = small
    ? "px-3 py-2 text-body-s rounded-[16px]"
    : "max-w-[88%] px-3.5 py-2.5 text-[15px] leading-[22px] rounded-[18px]";
  return from === "you" ? (
    <div
      className={`${size} self-end rounded-br-[6px] bg-inverse text-inverse-foreground`}
    >
      {children}
    </div>
  ) : (
    <div
      className={`${size} self-start rounded-bl-[6px] bg-sunken text-foreground`}
    >
      {children}
    </div>
  );
}

function Step({
  number,
  title,
  body,
  children,
}: {
  number: number;
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex min-w-0 flex-[1_1_280px] flex-col gap-4 rounded-lg border bg-card p-7">
      <div className="flex size-11 items-center justify-center rounded-full bg-primary font-display text-[22px] font-semibold text-primary-foreground">
        {number}
      </div>
      <h3 className="m-0 font-display text-[24px] leading-[30px] font-semibold">
        {title}
      </h3>
      <p className="m-0 text-muted-foreground">{body}</p>
      {children}
    </li>
  );
}

function Feature({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <li className="flex items-start gap-4">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-[12px] bg-sunken">
        <Icon className="size-[22px]" aria-hidden="true" />
      </span>
      <span className="flex flex-col gap-0.5">
        <b className="text-[17px] leading-6 font-semibold">{title}</b>
        <span className="text-muted-foreground">{body}</span>
      </span>
    </li>
  );
}

function PreviewPost({
  platform,
  status,
  children,
}: {
  platform: "LinkedIn" | "X" | "Threads";
  status: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-background p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-[15px] font-semibold">
          <PlatformMark
            platform={platform}
            className={`size-5 ${platform === "LinkedIn" ? "text-info" : ""}`}
          />
          {platform}
        </span>
        {status}
      </div>
      <p className="m-0 text-[15px] leading-[22px] whitespace-pre-line">
        {children}
      </p>
    </div>
  );
}

const tones = {
  success: "bg-success-subtle text-success",
  info: "bg-info-subtle text-info",
  warning: "bg-warning-subtle text-warning",
} as const;
function StatusBadge({
  tone,
  icon: Icon,
  children,
}: {
  tone: keyof typeof tones;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] leading-[18px] font-semibold ${tones[tone]}`}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {children}
    </span>
  );
}
