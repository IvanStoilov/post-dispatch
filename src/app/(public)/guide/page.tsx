import Link from "next/link";
import type { Metadata } from "next";
import { PageIntro, DocumentSection } from "@/components/public/site-shell";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, ArrowRight } from "lucide-react";
export const metadata: Metadata = {
  title: "Setup and daily AI drafts | PostDispatch",
  description:
    "Connect ChatGPT or Claude, submit your first draft, and configure an external workflow for daily AI generation.",
  alternates: { canonical: "/guide" },
};
const prompt = `Create one social post for this project. First call get_project to confirm the project name and available channels, then use list_posts to avoid repeating recent topics.

Brand: [your brand]
Audience: [your audience]
Tone: [your tone]
Today’s topic: [your topic]
Channels: [facebook, instagram, or linkedin]

Use the project’s create_draft tool to save a title, caption, and selected platforms. Use assets only when I provide media or an accessible HTTPS media URL. Do not invent image URLs or factual claims. For Instagram, flag any missing image or video for me to add during review.

Leave the post as a draft for my approval. Return the draft ID and review link.`;
export default function GuidePage() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto flex w-full max-w-4xl flex-col gap-12 px-5 py-12 sm:px-8 sm:py-16"
    >
      <PageIntro
        title="Your first draft, then your daily rhythm."
        description="Connect a project to your assistant, send a draft, and review it before publishing."
      />
      <nav
        aria-label="On this page"
        className="flex flex-wrap gap-x-6 gap-y-3 text-sm"
      >
        <a className="document-link" href="#workspace">
          Set up a project
        </a>
        <a className="document-link" href="#assistant">
          Connect an assistant
        </a>
        <a className="document-link" href="#first-draft">
          First draft
        </a>
        <a className="document-link" href="#daily-drafts">
          Daily drafts
        </a>
        <a className="document-link" href="#troubleshooting">
          Troubleshooting
        </a>
      </nav>
      <DocumentSection id="workspace" title="1. Set up your project">
        <p>
          <Link className="document-link" href="/signup">
            Create an account
          </Link>
          , then name your project for the brand you’re working on. Use a
          separate project for each brand so its accounts, posts, and assistant
          access stay together.
        </p>
        <p>
          Open Connections and choose Connect Facebook, Connect Instagram, or
          Connect LinkedIn. Authorize the requested permissions and select the
          destination where offered. Facebook publishes to Pages, Instagram
          requires a Business or Creator account, and LinkedIn supports a
          personal profile or an eligible company Page. Network permissions and
          app approval affect which options are available.
        </p>
        <p>
          You can prepare drafts before connecting a social account. Connect the
          account before publishing.
        </p>
      </DocumentSection>
      <DocumentSection id="assistant" title="2. Connect ChatGPT or Claude">
        <p>
          In the project’s MCP integration screen, copy its endpoint. Each
          project has its own URL; the assistant is authorized for that project.
        </p>
        <div className="grid gap-6 md:grid-cols-2">
          <section className="flex flex-col gap-3">
            <h3 className="text-lg font-semibold text-foreground">ChatGPT</h3>
            <ol className="flex list-decimal flex-col gap-3 pl-5">
              <li>
                Open the custom MCP connection setup in your ChatGPT settings.
                Access and menu names depend on your plan and workspace.
              </li>
              <li>
                Add PostDispatch using the project endpoint and choose OAuth.
                Use automatic/dynamic client registration; no PostDispatch
                client ID or secret is needed.
              </li>
              <li>
                Sign in to PostDispatch, approve access to the named project,
                and enable the connection in your conversation.
              </li>
            </ol>
          </section>
          <section className="flex flex-col gap-3">
            <h3 className="text-lg font-semibold text-foreground">Claude</h3>
            <ol className="flex list-decimal flex-col gap-3 pl-5">
              <li>
                Open Customize → Connectors and add a custom connector. Your
                workspace administrator may need to enable it.
              </li>
              <li>
                Enter the project endpoint. For this implementation, choose
                automatic client registration if Claude offers a registration
                choice.
              </li>
              <li>
                Complete the PostDispatch sign-in and consent flow, then enable
                the connector in your conversation.
              </li>
            </ol>
          </section>
        </div>
        <p>
          If your client supports bearer authentication instead, generate a
          project token in MCP integration and save it in the client’s secure
          credentials. Do not paste tokens into chat prompts. PostDispatch does
          not yet have a public directory listing, so setup currently uses the
          endpoint.
        </p>
      </DocumentSection>
      <DocumentSection id="first-draft" title="3. Send your first draft">
        <p>
          Ask your assistant to identify the project, then save a draft. Adapt
          this prompt to your brand:
        </p>
        <pre className="overflow-x-auto rounded-xl border bg-background p-5 text-sm leading-7 whitespace-pre-wrap text-foreground">
          <code>{prompt}</code>
        </pre>
        <p>
          For attached ChatGPT files, the assistant can use
          create_draft_from_files. Other clients can use create_draft with
          supported media URLs, inline image data, or uploaded asset IDs. A post
          accepts up to 10 images or one video.
        </p>
        <p>
          Open your PostDispatch inbox, edit the caption and media, check the
          selected channels, and click Publish when ready. The assistant cannot
          publish through MCP.
        </p>
      </DocumentSection>
      <DocumentSection
        id="daily-drafts"
        title="4. Configure daily AI generation"
      >
        <Alert>
          <Clock aria-hidden="true" />
          <AlertTitle>The schedule lives in your automation tool</AlertTitle>
          <AlertDescription>
            Connecting ChatGPT or Claude does not create a daily job.
            PostDispatch receives drafts; it does not currently run a scheduler
            or an AI model. Use an external scheduled workflow that can call a
            remote MCP server.
          </AlertDescription>
        </Alert>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">Daily schedule</Badge>
          <span aria-hidden="true">→</span>
          <Badge variant="secondary">AI agent</Badge>
          <span aria-hidden="true">→</span>
          <Badge variant="secondary">PostDispatch draft</Badge>
          <span aria-hidden="true">→</span>
          <Badge variant="outline">Your approval</Badge>
        </div>
        <h3 className="text-xl font-semibold text-foreground">
          Example: an n8n workflow
        </h3>
        <ol className="flex list-decimal flex-col gap-4 pl-5">
          <li>
            Create a workflow with a Schedule Trigger. Set it to run daily at
            your chosen time and configure the workflow timezone explicitly, for
            example Europe/Madrid.
          </li>
          <li>
            Add an AI Agent with a tool-capable model and its provider
            credentials. The automation service and model may have their own
            costs and usage limits; a chat subscription does not configure those
            credentials for you.
          </li>
          <li>
            Attach an MCP Client Tool to the agent. Use a version that supports
            Streamable HTTP, enter your PostDispatch project endpoint, and store
            its project token as a Bearer Auth credential. The token value goes
            in the credential, not the prompt. If a transport selector is
            available, choose Streamable HTTP.
          </li>
          <li>
            Allow get_project, list_posts, and create_draft. Add media upload
            tools only if your workflow supplies actual media. A text-only
            workflow can target Facebook or LinkedIn; Instagram needs an image
            or video before publishing.
          </li>
          <li>
            Use the first-draft prompt above with your brand details and a topic
            source. Add the current date and timezone to each run, set source to
            “Daily workflow”, and instruct the agent to skip creation if a
            matching draft already exists for that date. Checking existing
            drafts helps, but is not an atomic duplicate guarantee.
          </li>
          <li>
            Run the workflow manually. Confirm the correct project receives
            exactly one draft and that no publication occurs. Save and
            publish/activate the workflow to enable its schedule, then monitor
            the first scheduled execution.
          </li>
        </ol>
        <p>
          If a run stops after submitting a draft, check list_posts before
          rerunning. Do not automatically retry draft creation after an
          uncertain outcome. Pause the workflow in n8n to stop generation;
          rotate the PostDispatch token if its credentials need revoking.
        </p>
        <p>
          Reference documentation:{" "}
          <a
            className="document-link"
            href="https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.scheduletrigger/"
          >
            n8n Schedule Trigger
          </a>{" "}
          and{" "}
          <a
            className="document-link"
            href="https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.toolmcp/"
          >
            MCP Client Tool
          </a>
          . This is a configuration guide, not a workflow that PostDispatch
          installs or runs for you.
        </p>
      </DocumentSection>
      <DocumentSection id="troubleshooting" title="Common fixes">
        <div className="flex flex-col gap-6">
          {[
            [
              "The assistant cannot see the tools",
              "Enable the connection in the conversation, check your client’s plan/workspace permissions, and reconnect if authorization expired. Ask it to call get_project to confirm access.",
            ],
            [
              "The wrong project receives drafts",
              "Each endpoint belongs to one project. Compare the endpoint in the client with MCP integration, and verify the name returned by get_project.",
            ],
            [
              "Daily drafts are not arriving",
              "Check that the external workflow is active, its timezone is correct, the model credentials work, and its execution log shows a successful draft creation. A PostDispatch connection alone is not a schedule.",
            ],
            [
              "A channel requires reconnection",
              "Open Connections and reconnect the account. Expired tokens, revoked permissions, or missing network API access can prevent publication.",
            ],
            [
              "A post is marked for review",
              "Read its per-channel results and check the social networks before submitting again. A request can succeed remotely even if the response was interrupted.",
            ],
          ].map(([title, text]) => (
            <section key={title} className="flex flex-col gap-2">
              <h3 className="font-semibold text-foreground">{title}</h3>
              <p>{text}</p>
            </section>
          ))}
        </div>
        <Button variant="outline" className="w-fit" asChild>
          <Link href="/support">
            Get help
            <ArrowRight data-icon="inline-end" aria-hidden="true" />
          </Link>
        </Button>
      </DocumentSection>
    </main>
  );
}
