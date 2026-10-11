import { cn } from "cn";
import { brandMarkPath } from "@/lib/brand";

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={cn("size-9 shrink-0", className)}
    >
      <rect width="64" height="64" rx="16" className="fill-brand-forest" />
      <path
        d={brandMarkPath}
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-brand-ivory"
      />
      <circle cx="43" cy="47" r="4" className="fill-brand-apricot" />
    </svg>
  );
}
