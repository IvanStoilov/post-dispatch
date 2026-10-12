"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAppPath } from "@/components/app-navigation";
import { projectPath } from "@/lib/route-paths";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
export default function NewProject() {
  const router = useRouter(),
    appPath = useAppPath();
  const [name, setName] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <>
      <div>
        <h1 className="display-m">Create a project</h1>
        <p className="text-sm text-muted-foreground">
          Give each brand its own publishing workspace.
        </p>
      </div>
      <form
        method="post"
        className="flex max-w-md flex-col gap-4 rounded-lg border bg-card p-6"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const r = await fetch("/api/projects", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name }),
            });
            const data = await r.json();
            if (!r.ok)
              throw new Error(data.error || "Could not create project");
            router.push(appPath(projectPath(data.project.id, "assistant")));
            router.refresh();
          } catch (e) {
            setError(
              e instanceof Error ? e.message : "Could not create project",
            );
            setBusy(false);
          }
        }}
      >
        <Label htmlFor="project-name">Project name</Label>
        <Input
          id="project-name"
          required
          maxLength={120}
          value={name}
          disabled={busy}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your brand"
        />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button disabled={busy || !name.trim()}>
          {busy ? "Creating…" : "Create project"}
        </Button>
      </form>
    </>
  );
}
