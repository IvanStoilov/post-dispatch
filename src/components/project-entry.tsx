"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAppPath } from "./app-navigation";
import { projectPath } from "@/lib/route-paths";

export function ProjectEntry({
  ids,
  remembered,
}: {
  ids: string[];
  remembered?: string;
}) {
  const router = useRouter(),
    appPath = useAppPath();
  useEffect(() => {
    const preferred = remembered || localStorage.getItem("ramblo-project");
    const id = ids.find((id) => id === preferred) || ids[0];
    router.replace(appPath(id ? projectPath(id) : "/projects/new"));
  }, [ids, remembered, router, appPath]);
  return (
    <p role="status" className="p-8 text-sm text-muted-foreground">
      Opening your workspace…
    </p>
  );
}
