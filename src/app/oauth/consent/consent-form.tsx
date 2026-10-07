"use client";
import { useState } from "react";
import { ConnectionShell } from "@/components/connection-shell";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { Check, ShieldCheck } from "lucide-react";
export default function ConsentForm({
  query,
  clientName,
  redirectHost,
  scopes,
}: {
  query: string;
  clientName: string;
  redirectHost: string;
  scopes: string[];
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function consent(accept: boolean) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/oauth/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accept, oauth_query: query }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Unable to connect");
      window.location.assign(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to connect");
      setBusy(false);
    }
  }
  return (
    <ConnectionShell>
      <Card>
        <CardHeader>
          <CardTitle>
            <h1>Connect your PostDispatch account?</h1>
          </CardTitle>
          <CardDescription>
            {clientName} is requesting access to all your current and future
            PostDispatch projects.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <ul className="flex flex-col gap-3 text-sm">
            {[
              ["posts:read", "Read posts and publishing status"],
              ["posts:write", "Create drafts for your review"],
              ["offline_access", "Keep the connection using renewable access"],
            ]
              .filter(([scope]) => scopes.includes(scope))
              .map(([scope, text]) => (
                <li key={scope} className="flex items-start gap-2">
                  <Check
                    className="mt-0.5 size-4 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                  {text}
                </li>
              ))}
          </ul>
          <Alert>
            <ShieldCheck aria-hidden="true" />
            <AlertDescription>
              Publishing requires your approval in PostDispatch. This connection
              can read and create drafts across your projects.
            </AlertDescription>
          </Alert>
          <p className="break-words text-xs leading-relaxed text-muted-foreground">
            You will return to {redirectHost}. The requesting app supplies its
            client name.
          </p>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
        <CardFooter className="justify-end gap-2">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void consent(false)}
          >
            Deny
          </Button>
          <Button disabled={busy} onClick={() => void consent(true)}>
            {busy && <Spinner data-icon="inline-start" />}
            {busy ? "Connecting…" : "Allow access"}
          </Button>
        </CardFooter>
      </Card>
    </ConnectionShell>
  );
}
