import { Brand } from "@/components/brand";
export function ConnectionShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-8 px-5 py-12">
      <Brand />
      <div className="w-full max-w-lg">{children}</div>
    </main>
  );
}
