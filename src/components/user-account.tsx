"use client";
import { useState } from "react";
import Link from "next/link";
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
import { Trash2 } from "lucide-react";

export function UserAccount({ name, email }: { name: string; email: string }) {
  const appPath = useAppPath();
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false);
  const [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [error, setError] = useState("");
  function changeOpen(value: boolean) {
    if (busy) return;
    setOpen(value);
    setPassword("");
    setConfirmation("");
    setError("");
  }
  return (
    <>
      <div>
        <h1 className="display-m">User account</h1>
        <p className="text-sm text-muted-foreground">
          Manage your account and personal data.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Account details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-xs text-muted-foreground">Name</p>
            <p>{name}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Email address</p>
            <p className="break-all">{email}</p>
          </div>
        </CardContent>
      </Card>
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle>Delete account</CardTitle>
          <CardDescription>
            Permanently remove your account and all of your projects.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This removes your drafts, connection credentials, publication
            records, and assistant access. Stored media is scheduled for
            permanent removal. Posts already published on social networks remain
            there. Stop any external scheduled automations separately.
          </p>
          <Button variant="destructive" onClick={() => changeOpen(true)}>
            <Trash2 aria-hidden="true" />
            Delete account
          </Button>
        </CardContent>
      </Card>
      <Link href={appPath()} className="document-link w-fit">
        Back to workspace
      </Link>
      <AlertDialog open={open} onOpenChange={changeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Permanently delete your account?
            </AlertDialogTitle>
            <AlertDialogDescription>
              All projects associated with {email} will be deleted. Queued
              publications will be cancelled. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <form
            className="space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              if (busy || confirmation !== "DELETE" || !password) return;
              setBusy(true);
              setError("");
              try {
                const response = await fetch("/api/account", {
                  method: "DELETE",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ password, confirmation }),
                });
                const data = await response.json();
                if (!response.ok)
                  throw new Error(
                    data.error || "Could not delete your account.",
                  );
                localStorage.removeItem("ramblo-project");
                document.cookie = "ramblo-project=; Path=/; Max-Age=0";
                window.location.replace(appPath("/signin?account=deleted"));
              } catch (error) {
                const message =
                  error instanceof Error
                    ? error.message
                    : "Could not delete your account.";
                setError(message);
                toast.error(message);
                setBusy(false);
              }
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="delete-account-password">Current password</Label>
              <Input
                id="delete-account-password"
                type="password"
                autoComplete="current-password"
                required
                maxLength={128}
                value={password}
                disabled={busy}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="delete-account-confirmation">
                Type DELETE to confirm
              </Label>
              <Input
                id="delete-account-confirmation"
                autoComplete="off"
                spellCheck={false}
                required
                value={confirmation}
                disabled={busy}
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
                Keep my account
              </AlertDialogCancel>
              <Button
                type="submit"
                variant="destructive"
                disabled={busy || !password || confirmation !== "DELETE"}
              >
                {busy ? "Deleting account…" : "Permanently delete account"}
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
