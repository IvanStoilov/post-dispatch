"use client";
import { Copy, KeyRound, Plug } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
  InputGroupButton,
} from "@/components/ui/input-group";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import type { Project } from "@/lib/types";

export default function AssistantSettings({
  project,
  endpoint,
  token,
  busy,
  configured,
  grants,
  onRotate,
  onRevoke,
  onNotice,
}: {
  project?: Project;
  endpoint: string;
  token: string;
  busy: boolean;
  configured: boolean;
  grants: { clientId: string; name: string }[];
  onRotate: () => void;
  onRevoke: (clientId: string) => Promise<void>;
  onNotice: (message: string) => void;
}) {
  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      onNotice(`${label} copied.`);
    } catch {
      onNotice(`Select and copy the ${label.toLowerCase()} shown here.`);
    }
  }
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>
            <h2 className="flex items-center gap-2">
              <Plug className="size-5" aria-hidden="true" />
              Connect an assistant
            </h2>
          </CardTitle>
          <CardDescription>
            Connect once to manage all your projects in ChatGPT, Claude, or
            another MCP client.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="mcp-endpoint">Account endpoint</FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id="mcp-endpoint"
                  name="mcpEndpoint"
                  readOnly
                  value={endpoint}
                  spellCheck={false}
                  autoComplete="off"
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    aria-label="Copy MCP endpoint"
                    onClick={() => void copy(endpoint, "Endpoint")}
                  >
                    <Copy aria-hidden="true" />
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
            </Field>
          </FieldGroup>
          <Separator />
          <div className="grid gap-6 md:grid-cols-2">
            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold">Connect with OAuth</h3>
              <ol className="ml-4 flex list-decimal flex-col gap-2 text-sm leading-relaxed text-muted-foreground">
                <li>Add a custom MCP server in your assistant.</li>
                <li>Paste the endpoint and choose OAuth.</li>
                <li>
                  Use dynamic client registration; leave Client ID and Client
                  Secret blank.
                </li>
                <li>
                  Sign in and approve access to your account’s current and
                  future projects.
                </li>
              </ol>
            </div>
            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold">Try a first draft</h3>
              <blockquote className="rounded-lg bg-muted p-4 text-sm leading-relaxed">
                Create a Facebook draft for {project?.name || "my project"}{" "}
                about our latest update. Use projectId{" "}
                {project?.id || "from list_projects"}.
              </blockquote>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Remote assistants need a public HTTPS endpoint. Call
                list_projects to find project IDs. With one project, selection
                is automatic; with multiple projects, every project tool
                requires projectId.
              </p>
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Badge variant="secondary">OAuth available</Badge>
        </CardFooter>
      </Card>
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2 className="flex items-center gap-2">
                <KeyRound className="size-5" aria-hidden="true" />
                Account bearer token
              </h2>
            </CardTitle>
            <CardDescription>
              For clients that connect using a token instead of OAuth.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {token && (
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="mcp-token">
                    New token — copy it now
                  </FieldLabel>
                  <InputGroup>
                    <InputGroupInput
                      id="mcp-token"
                      name="mcpToken"
                      readOnly
                      value={token}
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupButton
                        aria-label="Copy MCP token"
                        onClick={() => void copy(token, "Token")}
                      >
                        <Copy aria-hidden="true" />
                      </InputGroupButton>
                    </InputGroupAddon>
                  </InputGroup>
                  <p className="text-xs text-muted-foreground">
                    This token is shown only once.
                  </p>
                </Field>
              </FieldGroup>
            )}
            <code
              className="overflow-x-auto rounded-lg bg-muted p-3 text-xs"
              translate="no"
            >
              Authorization: Bearer YOUR_ACCOUNT_TOKEN
            </code>
            <p className="text-sm text-muted-foreground">
              Replacing a token disconnects clients using the previous one.
            </p>
          </CardContent>
          <CardFooter>
            {configured ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" disabled={busy}>
                    Replace MCP token
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Replace your account’s token?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      Clients using the current bearer token will need the new
                      token. OAuth connections remain active.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction disabled={busy} onClick={onRotate}>
                      Replace token
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : (
              <Button variant="outline" disabled={busy} onClick={onRotate}>
                Generate MCP token
              </Button>
            )}
          </CardFooter>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Connected assistants</h2>
            </CardTitle>
            <CardDescription>
              Manage apps authorized through OAuth.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {grants.length ? (
              grants.map((grant) => (
                <div
                  key={grant.clientId}
                  className="flex min-w-0 items-center justify-between gap-3"
                >
                  <span className="truncate text-sm">{grant.name}</span>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" disabled={busy}>
                        Disconnect
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          Disconnect {grant.name}?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          This assistant will lose access to all your projects.
                          It can request access again later.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          variant="destructive"
                          disabled={busy}
                          onClick={() => void onRevoke(grant.clientId)}
                        >
                          Disconnect
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ))
            ) : (
              <p className="py-3 text-sm text-muted-foreground">
                No assistants connected yet. Use the endpoint above to connect
                your first one.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
