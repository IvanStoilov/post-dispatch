import { Brand } from "@/components/brand";
import { FlowPanel } from "@/components/flow-panel";
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-svh lg:grid-cols-2">
      <section className="hidden flex-col justify-between border-r px-12 py-10 lg:flex xl:px-20">
        <Brand />
        <div className="mx-auto flex w-full max-w-md flex-col gap-10 py-16">
          <div className="flex flex-col gap-5">
            <p className="text-display font-semibold">
              Your ideas.
              <br />
              Ready for the world.
            </p>
            <p className="max-w-sm text-base leading-relaxed text-muted-foreground">
              One place to turn AI drafts into posts you’re proud to publish.
            </p>
          </div>
          <FlowPanel />
        </div>
      </section>
      <section className="flex min-w-0 flex-col items-center justify-center gap-10 bg-card px-6 py-12 sm:px-10">
        <div className="lg:hidden">
          <Brand />
        </div>
        {children}
      </section>
    </main>
  );
}
