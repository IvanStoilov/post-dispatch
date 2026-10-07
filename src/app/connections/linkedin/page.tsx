"use client";
import { LinkedIn } from "@/components/channel-icons";
import { useEffect, useState } from "react";
import Link from "next/link";
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";

export default function SelectLinkedInPage() {
  const [pages, setPages] = useState<{ id: string; name: string }[]>([]);
  const [project, setProject] = useState("");
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void fetch("/api/connectors/linkedin/accounts", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Could not load Pages.");
        if (active) {
          setPages(data.pages);
          setProject(data.projectName);
          setSelected(data.pages[0]?.id || "");
        }
      })
      .catch((error) => {
        if (active) setError(error.message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/connectors/linkedin/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId: selected }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not connect Page.");
      window.location.assign(data.url);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Connection failed.");
      setBusy(false);
    }
  }
  return (
    <ConnectionShell>
      <form onSubmit={save}>
        <Card>
          <CardHeader>
            <CardTitle>
              <h1 className="flex items-center gap-2">
                <LinkedIn className="size-5" aria-hidden="true" />
                Connect a LinkedIn account
              </h1>
            </CardTitle>
            <CardDescription>
              Select the profile or company Page to publish to from{" "}
              {project || "your project"}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="linkedin-page">
                  LinkedIn account
                </FieldLabel>
                <Select
                  value={selected}
                  disabled={busy || !pages.length}
                  onValueChange={setSelected}
                >
                  <SelectTrigger id="linkedin-page" className="w-full">
                    <SelectValue placeholder="Select a Page…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {pages.map((page) => (
                        <SelectItem key={page.id} value={page.id}>
                          {page.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </FieldGroup>
          </CardContent>
          <CardFooter className="flex-wrap justify-between gap-3">
            <Button variant="ghost" asChild>
              <Link href="/?view=Connections">Cancel</Link>
            </Button>
            <Button type="submit" disabled={busy || !selected}>
              {busy && <Spinner data-icon="inline-start" />}
              {busy ? "Connecting…" : "Connect selected account"}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </ConnectionShell>
  );
}
