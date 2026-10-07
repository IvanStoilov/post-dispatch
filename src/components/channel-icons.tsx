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

export function LinkedIn(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M5 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM3 9h4v12H3V9Zm6 0h4v1.6c.8-1.2 2-1.9 3.5-1.9 3 0 4.5 1.9 4.5 5.3v7h-4v-6.5c0-1.7-.6-2.6-1.8-2.6-1.5 0-2.2 1-2.2 2.8V21H9V9Z" />
    </svg>
  );
}
