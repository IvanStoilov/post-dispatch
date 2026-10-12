import Link from "next/link";
import { Logo } from "@/components/brand";
import { brand } from "@/lib/brand";
import { site } from "@/lib/public-site";
import { appPageUrl } from "@/lib/origins";

const pill =
  "inline-flex items-center rounded-full font-semibold transition-colors duration-150";
// Section links point at the homepage so they also work from other pages.
const productLinks = [
  ["/#how", "How it works"],
  ["/#networks", "Networks"],
  ["/#agents", "Agents"],
] as const;
export function SiteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only fixed top-3 left-3 rounded-full bg-primary px-5 py-3 font-semibold text-primary-foreground focus:not-sr-only focus:z-50"
      >
        Skip to content
      </a>
      <header className="border-b">
        <nav
          aria-label="Main"
          className="mx-auto flex max-w-[1200px] items-center justify-between gap-6 px-[clamp(16px,4vw,40px)] py-4"
        >
          <Link href="/" aria-label={`${brand.name} home`} className="flex">
            <Logo className="h-9" />
          </Link>
          <div className="hidden gap-8 text-[15px] font-medium min-[761px]:flex">
            {productLinks.map(([href, label]) => (
              <Link
                key={href}
                href={href}
                className="text-muted-foreground no-underline hover:text-foreground"
              >
                {label}
              </Link>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <Link
              href={appPageUrl("/signin")}
              className="hidden px-3 py-2.5 text-[15px] font-semibold text-foreground no-underline hover:text-muted-foreground min-[761px]:inline"
            >
              Log in
            </Link>
            <Link
              href={appPageUrl("/signup")}
              className={`${pill} min-h-11 bg-primary px-5 text-[15px] text-primary-foreground no-underline hover:bg-primary-hover`}
            >
              Get started
            </Link>
          </div>
        </nav>
      </header>
      {children}
      <footer className="mt-auto border-t">
        <div className="mx-auto flex max-w-[1200px] flex-wrap justify-between gap-10 px-[clamp(16px,4vw,40px)] pt-12 pb-8">
          <div className="flex flex-[1_1_240px] flex-col gap-3">
            <Logo className="h-8 self-start" />
            <span className="text-[15px] text-muted-foreground">
              {brand.tagline}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-16 gap-y-8 text-body-s">
            <FooterColumn
              title="Product"
              links={[...productLinks, [appPageUrl("/signin"), "Log in"]]}
            />
            <FooterColumn
              title="Company"
              links={[
                ["/legal", "About"],
                ["/support", "Contact"],
              ]}
            />
            <FooterColumn
              title="Legal"
              links={[
                ["/privacy", "Privacy"],
                ["/terms", "Terms"],
              ]}
            />
          </div>
        </div>
        <p className="mx-auto max-w-[1200px] px-[clamp(16px,4vw,40px)] pb-8 text-[13px] leading-[18px] text-subtle-foreground">
          © {new Date().getFullYear()} {brand.name} · {brand.domain} · Operated
          by {site.operator}, {site.country}
        </p>
      </footer>
    </div>
  );
}
function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: readonly (readonly [string, string])[];
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <b className="text-body-s font-semibold">{title}</b>
      {links.map(([href, label]) => (
        <Link
          key={label}
          href={href}
          className="text-muted-foreground no-underline hover:text-foreground"
        >
          {label}
        </Link>
      ))}
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
      <h1 className="display-m">{title}</h1>
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
      <h2 className="heading-l">{title}</h2>
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
