import Link from "next/link";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { site } from "@/lib/public-site";
export function SiteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col bg-card">
      <a
        href="#main-content"
        className="sr-only fixed top-3 left-3 rounded-lg bg-primary p-3 text-primary-foreground focus:not-sr-only focus:z-50"
      >
        Skip to content
      </a>
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-5 py-5 sm:px-8">
          <Brand />
          <nav
            aria-label="Main navigation"
            className="order-last flex w-full items-center gap-6 text-sm md:order-none md:ml-auto md:w-auto"
          >
            <Link className="public-link" href="/guide">
              How it works
            </Link>
            <Link className="public-link" href="/support">
              Support
            </Link>
            <Link className="public-link ml-auto md:hidden" href="/signin">
              Sign in
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-2 md:ml-4">
            <Button variant="ghost" asChild className="hidden md:inline-flex">
              <Link href="/signin">Sign in</Link>
            </Button>
            <Button asChild>
              <Link href="/signup">Get started</Link>
            </Button>
          </div>
        </div>
      </header>
      {children}
      <footer className="mt-auto">
        <Separator />
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-5 py-8 text-sm sm:px-8 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-1">
            <p className="font-semibold">PostDispatch</p>
            <p className="text-muted-foreground">
              Operated by {site.operator}, {site.country}.
            </p>
          </div>
          <nav
            aria-label="Footer navigation"
            className="flex flex-wrap gap-x-5 gap-y-3"
          >
            <Link className="public-link" href="/privacy">
              Privacy
            </Link>
            <Link className="public-link" href="/terms">
              Terms
            </Link>
            <Link className="public-link" href="/legal">
              Company details
            </Link>
            <Link className="public-link" href="/support">
              Contact
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
export function PageIntro({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <header className="flex flex-col gap-4">
      <h1 className="text-display font-semibold">{title}</h1>
      <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground">
        {description}
      </p>
    </header>
  );
}
export function DocumentSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="flex scroll-mt-8 flex-col gap-4">
      <h2 className="text-page font-semibold">{title}</h2>
      <div className="flex flex-col gap-4 text-base leading-7 text-muted-foreground">
        {children}
      </div>
    </section>
  );
}
export function PolicyDate() {
  return (
    <p className="text-sm text-muted-foreground">
      Last updated{" "}
      <time dateTime={site.updated}>
        {new Intl.DateTimeFormat("en-GB", {
          day: "numeric",
          month: "long",
          year: "numeric",
          timeZone: "Europe/Madrid",
        }).format(new Date(`${site.updated}T12:00:00Z`))}
      </time>
      .
    </p>
  );
}
