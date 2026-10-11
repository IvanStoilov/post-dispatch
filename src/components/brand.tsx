"use client";
import { useAppPath } from "./app-navigation";
import Link from "next/link";
import { brand } from "@/lib/brand";
import { cn } from "cn";

export function Brand({ className }: { className?: string }) {
  const appPath = useAppPath();
  return (
    <Link
      href={appPath()}
      translate="no"
      className={cn(
        "inline-flex w-fit items-center gap-2.5 rounded-lg text-[1.875rem] leading-none font-extrabold tracking-[-0.06em] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring",
        className,
      )}
    >
      <span aria-label={brand.name}>
        ramblo
        <span aria-hidden="true" className="text-primary">
          .
        </span>
      </span>
    </Link>
  );
}
