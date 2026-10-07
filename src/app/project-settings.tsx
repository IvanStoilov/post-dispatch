"use client";
import { platforms, channelLabels } from "@/lib/connectors/catalog";
import { channelIcons } from "@/components/channel-catalog";
import { useEffect, useState } from "react";
import type { Project, Platform } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  CardAction,
} from "@/components/ui/card";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Plus, Save } from "lucide-react";
export default function ProjectSettings({
  project,
  creating,
  onCreated,
  onSaved,
}: {
  project: Project;
  creating: boolean;
  onCreated: (id: string, token: string) => Promise<void>;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(project.name);
  const [newName, setNewName] = useState("");
  const [facebookPageId, setFacebookPageId] = useState(project.facebookPageId);
  const [instagramAccountId, setInstagramAccountId] = useState(
    project.instagramAccountId,
  );
  const [facebookPageToken, setFacebookPageToken] = useState("");
  const [instagramAccessToken, setInstagramAccessToken] = useState("");
  const [host, setHost] = useState(project.instagramApiHost);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      const status = new URLSearchParams(window.location.search).get(
        "connection",
      );
      if (platforms.some((p) => p === status))
        setMessage(`${channelLabels[status as Platform]} connected.`);
      else if (status === "cancelled")
        setMessage("Connection cancelled. Your saved accounts were kept.");
      else if (status === "failed")
        setMessage("Connection failed. Try connecting again.");
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  const [busy, setBusy] = useState(false);
  const [disconnecting, setDisconnecting] = useState<Platform | null>(null);
  async function connect(provider: Platform) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/${provider === "linkedin" ? "connectors" : "meta"}/${provider}/start`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: project.id }),
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Could not start connection");
      window.location.assign(result.url);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not connect account",
      );
      setBusy(false);
    }
  }
  async function call(url: string, body: unknown) {
    const response = await fetch(url, {
      method: url.endsWith("/projects") ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not save project");
    return result;
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await call(`/api/projects/${project.id}`, {
        name,
        facebookPageId,
        instagramAccountId,
        instagramApiHost: host,
        ...(facebookPageToken ? { facebookPageToken } : {}),
        ...(instagramAccessToken ? { instagramAccessToken } : {}),
      });
      setFacebookPageToken("");
      setInstagramAccessToken("");
      setMessage("Project configuration saved.");
      await onSaved();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }
  async function disconnect(platform: Platform) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/projects/${project.id}/connectors/${platform}`,
        { method: "DELETE" },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Disconnect failed");
      if (platform === "facebook") {
        setFacebookPageId("");
        setFacebookPageToken("");
      }
      if (platform === "instagram") {
        setInstagramAccountId("");
        setInstagramAccessToken("");
      }
      setMessage("Channel disconnected.");
      await onSaved();
      setDisconnecting(null);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Disconnect failed");
    } finally {
      setBusy(false);
    }
  }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await call("/api/projects", { name: newName });
      await onCreated(result.project.id, result.mcpToken);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not create project");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col gap-6">
      {creating && (
        <form onSubmit={create}>
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Create a project</h2>
              </CardTitle>
              <CardDescription>
                Keep each brand’s drafts, channels, and assistants together.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="new-project">Project name</FieldLabel>
                  <Input
                    id="new-project"
                    name="newProjectName"
                    autoComplete="off"
                    required
                    maxLength={120}
                    value={newName}
                    disabled={busy}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Your brand or business…"
                  />
                </Field>
              </FieldGroup>
            </CardContent>
            <CardFooter>
              <Button type="submit" disabled={busy}>
                {busy ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <Plus data-icon="inline-start" aria-hidden="true" />
                )}
                Create project
              </Button>
            </CardFooter>
          </Card>
        </form>
      )}
      <form onSubmit={save} className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Project details</h2>
            </CardTitle>
            <CardDescription>
              These settings apply only to this project.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="project-name">Project name</FieldLabel>
                <Input
                  id="project-name"
                  name="projectName"
                  autoComplete="off"
                  required
                  maxLength={120}
                  value={name}
                  disabled={busy}
                  onChange={(e) => setName(e.target.value)}
                  className="max-w-md"
                />
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>
        <div className="grid gap-6 lg:grid-cols-2">
          {platforms.map((provider) => {
            const facebook = provider === "facebook";
            const connection = project.connectors?.[provider];
            const configured =
              connection?.configured ??
              (facebook
                ? project.facebookConfigured
                : provider === "instagram"
                  ? project.instagramConfigured
                  : false);
            const Icon = channelIcons[provider];
            const label = channelLabels[provider];
            return (
              <Card key={provider}>
                <CardHeader>
                  <CardTitle>
                    <h2 className="flex items-center gap-2">
                      <Icon className="size-5" aria-hidden="true" />
                      {label}
                    </h2>
                  </CardTitle>
                  <CardDescription>
                    {facebook
                      ? "Publish to your Facebook Page."
                      : provider === "linkedin"
                        ? "Publish to a personal profile or company Page."
                        : "Publish to a Business or Creator account."}
                  </CardDescription>
                  <CardAction>
                    <Badge variant={configured ? "secondary" : "outline"}>
                      {configured
                        ? "Configured"
                        : connection?.expiresAt
                          ? "Reconnect required"
                          : "Not connected"}
                    </Badge>
                  </CardAction>
                </CardHeader>
                <CardContent className="flex flex-col gap-5">
                  <Button
                    type="button"
                    size="lg"
                    variant={configured ? "outline" : "default"}
                    disabled={busy}
                    onClick={() => void connect(provider)}
                  >
                    {configured ? `Reconnect ${label}` : `Connect ${label}`}
                  </Button>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {facebook
                      ? "Sign in with Facebook, grant publishing access, and choose your Page."
                      : provider === "linkedin"
                        ? "Sign in with LinkedIn, then choose your profile or an authorized company Page."
                        : "Sign in with Instagram and grant publishing access. No Facebook Page needed."}
                  </p>
                  {provider !== "linkedin" && (
                    <Accordion type="single" collapsible>
                      <AccordionItem value="manual">
                        <AccordionTrigger>
                          Manual configuration
                        </AccordionTrigger>
                        <AccordionContent>
                          <FieldGroup className="py-3">
                            <Field>
                              <FieldLabel htmlFor={`${provider}-id`}>
                                {facebook ? "Page ID" : "Account ID"}
                              </FieldLabel>
                              <Input
                                id={`${provider}-id`}
                                name={`${provider}Id`}
                                autoComplete="off"
                                spellCheck={false}
                                value={
                                  facebook ? facebookPageId : instagramAccountId
                                }
                                disabled={busy}
                                onChange={(e) =>
                                  facebook
                                    ? setFacebookPageId(e.target.value)
                                    : setInstagramAccountId(e.target.value)
                                }
                              />
                            </Field>
                            <Field>
                              <FieldLabel htmlFor={`${provider}-token`}>
                                {facebook
                                  ? "Page access token"
                                  : "Access token"}
                              </FieldLabel>
                              <Input
                                id={`${provider}-token`}
                                name={`${provider}Token`}
                                type="password"
                                autoComplete="new-password"
                                value={
                                  facebook
                                    ? facebookPageToken
                                    : instagramAccessToken
                                }
                                disabled={busy}
                                onChange={(e) =>
                                  facebook
                                    ? setFacebookPageToken(e.target.value)
                                    : setInstagramAccessToken(e.target.value)
                                }
                                placeholder={
                                  configured
                                    ? "Leave blank to keep saved token…"
                                    : "Paste your token…"
                                }
                              />
                              <FieldDescription>
                                Saved tokens are never displayed.
                              </FieldDescription>
                            </Field>
                            {!facebook && (
                              <Field>
                                <FieldLabel htmlFor="instagram-host">
                                  Login method
                                </FieldLabel>
                                <Select
                                  value={host}
                                  disabled={busy}
                                  onValueChange={(value) =>
                                    setHost(
                                      value as Project["instagramApiHost"],
                                    )
                                  }
                                >
                                  <SelectTrigger
                                    id="instagram-host"
                                    className="w-full"
                                  >
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectGroup>
                                      <SelectItem value="graph.facebook.com">
                                        Facebook Login
                                      </SelectItem>
                                      <SelectItem value="graph.instagram.com">
                                        Instagram Login
                                      </SelectItem>
                                    </SelectGroup>
                                  </SelectContent>
                                </Select>
                              </Field>
                            )}
                          </FieldGroup>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  )}
                </CardContent>
                <CardFooter className="justify-between gap-3">
                  <span className="truncate text-xs text-muted-foreground">
                    {configured
                      ? `Account ${connection?.accountName || connection?.accountId || (facebook ? project.facebookPageId : project.instagramAccountId)}`
                      : "Connect an account to start publishing"}
                  </span>
                  {configured && (
                    <Button
                      variant="destructive"
                      size="sm"
                      type="button"
                      disabled={busy}
                      onClick={() => setDisconnecting(provider)}
                    >
                      Disconnect
                    </Button>
                  )}
                </CardFooter>
              </Card>
            );
          })}
        </div>
        {message && (
          <Alert role="status" aria-live="polite">
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}
        <div className="flex justify-end">
          <Button type="submit" size="lg" disabled={busy}>
            {busy ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <Save data-icon="inline-start" aria-hidden="true" />
            )}
            {busy ? "Saving…" : "Save project settings"}
          </Button>
        </div>
      </form>
      <AlertDialog
        open={!!disconnecting}
        onOpenChange={(open) => {
          if (!open && !busy) setDisconnecting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Disconnect{" "}
              {disconnecting ? channelLabels[disconnecting] : "channel"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This project will stop publishing to this account. You can
              reconnect it later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                if (disconnecting) void disconnect(disconnecting);
              }}
            >
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
