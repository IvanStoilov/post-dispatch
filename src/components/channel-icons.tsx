import type { SVGProps } from "react";

// Brand marks are kept separately from the Lucide interface icon set.
export function Facebook(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M14 21v-8h3l.5-4H14V7c0-1.2.3-2 2-2h1.7V1.4A24 24 0 0 0 15.2 1C12.4 1 10.5 2.7 10.5 5.8V9H7v4h3.5v8H14Z" />
    </svg>
  );
}
export function Instagram(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      {...props}
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
