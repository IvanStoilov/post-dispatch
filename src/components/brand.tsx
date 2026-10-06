import Link from "next/link";
import { Send } from "lucide-react";
import { cn } from "cn";

export function Brand({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      translate="no"
      className={cn(
        "inline-flex w-fit items-center gap-2.5 rounded-lg font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring",
        className,
      )}
    >
      <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <Send className="size-4" aria-hidden="true" />
      </span>
      <span>PostDispatch</span>
    </Link>
  );
}
