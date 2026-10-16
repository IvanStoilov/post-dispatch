"use client";
import Link from "next/link";
import { cn } from "cn";
import { useAppPath } from "./app-navigation";
import { brand } from "@/lib/brand";

/** Symbol plus wordmark; swaps to the sun symbol and cream type in dark mode. */
export function Logo({ className }: { className?: string }) {
  // Two images toggled by CSS update instantly when the system theme changes.
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- static SVG logo */}
      <img
        src="/brand/logo.svg"
        alt={brand.name}
        className={cn("block h-9 w-auto dark:hidden", className)}
      />
      {/* eslint-disable-next-line @next/next/no-img-element -- static SVG logo */}
      <img
        src="/brand/logo-on-dark.svg"
        alt={brand.name}
        className={cn("hidden h-9 w-auto dark:block", className)}
      />
    </>
  );
}
export function Brand({ className }: { className?: string }) {
  const appPath = useAppPath();
  return (
    <Link
      href={appPath()}
      translate="no"
      className="inline-flex w-fit items-center rounded-xs"
    >
      <Logo className={className} />
    </Link>
  );
}
