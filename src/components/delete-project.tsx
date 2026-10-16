"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { useAppPath } from "./app-navigation";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "./ui/card";
import { Alert, AlertDescription } from "./ui/alert";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "./ui/alert-dialog";
import { toast } from "./ui/sonner";
import type { Project } from "@/lib/types";
import { api, userMessage } from "@/lib/api-client";

export function DeleteProject({
  project,
  disabled,
}: {
  project: Project;
  disabled?: boolean;
}) {
  const router = useRouter(),
    appPath = useAppPath();
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState(""),
    [error, setError] = useState("");
  const isDeletionAllowed =
    confirmation.toLowerCase() === project.name.toLowerCase();
  function changeOpen(value: boolean) {
    if (busy) {
      return;
    }
    setOpen(value);
    setConfirmation("");
    setError("");
  }
  return (
    <>
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle>
            <h2>Delete project</h2>
          </CardTitle>
          <CardDescription>
            Permanently remove “{project.name}” and its data.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This deletes this project’s drafts, connection credentials,
            publication records, and upload permissions. Queued publications are
            cancelled and stored media is scheduled for removal. Your account
            and other projects remain available. Posts already published on
            social networks remain there.
          </p>
          <Button
            type="button"
            variant="destructive"
            disabled={disabled}
            onClick={() => changeOpen(true)}
          >
            <Trash2 aria-hidden="true" />
            Delete project
          </Button>
        </CardContent>
      </Card>
      <AlertDialog open={open} onOpenChange={changeOpen}>
        <AlertDialogContent size="lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{project.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This project and all of its data will be permanently removed. This
              action cannot be undone. Stop any external automation targeting
              this project separately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <form
            className="space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              if (busy || !isDeletionAllowed) {
                return;
              }
              setBusy(true);
              setError("");
              try {
                await api.projects.delete({ id: project.id, confirmation });
                localStorage.removeItem("ramblo-project");
                document.cookie = "ramblo-project=; Path=/; Max-Age=0";
                setOpen(false);
                toast.success(
                  "Project deleted. Stored media is scheduled for removal.",
                );
                router.replace(appPath());
                router.refresh();
              } catch (error) {
                const message = userMessage(error, "Could not delete project.");
                setError(message);
                toast.error(message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="delete-project-confirmation">
                Type {project.name} to confirm
              </Label>
              <Input
                id="delete-project-confirmation"
                autoComplete="off"
                spellCheck={false}
                maxLength={120}
                required
                disabled={busy}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel type="button" disabled={busy}>
                Keep project
              </AlertDialogCancel>
              <Button
                type="submit"
                variant="destructive"
                disabled={busy || !isDeletionAllowed}
              >
                {busy ? "Deleting project…" : "Permanently delete project"}
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
