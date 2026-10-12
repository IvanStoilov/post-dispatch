"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAppPath } from "./app-navigation";
import { projectPath } from "@/lib/route-paths";
import { toast } from "./ui/sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./ui/dialog";

export function CreateProjectDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter(),
    appPath = useAppPath();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!busy) onOpenChange(value);
      }}
    >
      <DialogContent showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>Create a project</DialogTitle>
          <DialogDescription>
            Give each brand its own publishing workspace.
          </DialogDescription>
        </DialogHeader>
        <form
          method="post"
          className="flex flex-col gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy || !name.trim()) return;
            setBusy(true);
            setError("");
            try {
              const response = await fetch("/api/projects", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: name.trim() }),
              });
              const data = await response.json();
              if (!response.ok)
                throw new Error(data.error || "Could not create project");
              toast.success("Project created.");
              onOpenChange(false);
              router.push(appPath(projectPath(data.project.id, "assistant")));
              router.refresh();
            } catch (error) {
              setError(
                error instanceof Error
                  ? error.message
                  : "Could not create project",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-project-name">Project name</Label>
            <Input
              id="new-project-name"
              required
              maxLength={120}
              value={name}
              disabled={busy}
              onChange={(event) => setName(event.target.value)}
              placeholder="Your brand"
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? "Creating…" : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
