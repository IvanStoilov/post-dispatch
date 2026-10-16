"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAppPath } from "./app-navigation";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "./ui/card";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { toast } from "./ui/sonner";
import { api, userMessage } from "@/lib/api-client";

export function LegalAgreements({
  records,
  terms,
}: {
  records: { id: string; termsVersion: string; acceptedAt: string }[];
  terms: { version: string; hash: string };
}) {
  const appPath = useAppPath(),
    router = useRouter();
  const [accepted, setAccepted] = useState(false),
    [busy, setBusy] = useState(false);
  const current = records.some((r) => r.termsVersion === terms.version);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Legal &amp; Agreements</CardTitle>
        <CardDescription>
          Your acceptance history and original agreements.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {records.length ? (
          <ul className="space-y-4">
            {records.map((record) => (
              <li key={record.id} className="space-y-1">
                <p className="font-medium">
                  Terms of Service · {record.termsVersion}
                </p>
                <p className="text-sm text-muted-foreground">
                  <time dateTime={record.acceptedAt}>
                    {record.acceptedAt} (UTC)
                  </time>
                </p>
                <Link
                  className="document-link text-sm"
                  href={appPath(`/account/agreements/${record.id}`)}
                >
                  View original accepted terms
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No Terms of Service acceptance has been recorded for your account.
            We do not infer acceptance from past use.
          </p>
        )}
        {!current && (
          <form
            className="space-y-4 border-t pt-4"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!accepted || busy) {
                return;
              }
              setBusy(true);
              try {
                await api.terms.accept({
                  termsAccepted: true,
                  termsVersion: terms.version,
                  termsHash: terms.hash,
                });
                toast.success("Terms of Service accepted.");
                setAccepted(false);
                router.refresh();
              } catch (error) {
                toast.error(userMessage(error, "Could not record acceptance."));
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="flex items-start gap-3">
              <Checkbox
                id="account-terms"
                required
                checked={accepted}
                disabled={busy}
                onCheckedChange={(v) => setAccepted(v === true)}
              />
              <label htmlFor="account-terms" className="text-sm leading-6">
                I have read and agree to Ramblo&apos;s{" "}
                <Link
                  className="document-link"
                  href="/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Terms of Service
                </Link>
                .
              </label>
            </div>
            <Button disabled={!accepted || busy} type="submit">
              {busy ? "Saving…" : "Accept current terms"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
