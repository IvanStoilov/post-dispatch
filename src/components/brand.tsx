"use client";
import { useAppPath } from "./app-navigation";
import Link from "next/link";
import { BrandMark } from "./brand-mark";
import { cn } from "cn";

export function Brand({ className }: { className?: string }) {
  const appPath = useAppPath();
  return (
    <Link
      href={appPath()}
      translate="no"
      className={cn(
        "inline-flex w-fit items-center gap-2.5 rounded-lg font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring",
        className,
      )}
    >
      <BrandMark />
      <span>PostDispatch</span>
    </Link>
  );
}
