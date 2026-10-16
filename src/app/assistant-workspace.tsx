"use client";
import { useEffect, useState } from "react";
import { useWorkspace } from "@/components/workspace-shell";
import { toast } from "@/components/ui/sonner";
import { api, userMessage } from "@/lib/api-client";
import type { AssistantAccessDto } from "@/shared/schemas/assistants";
import AssistantSettings from "./assistant-settings";
export default function AssistantPage() {
  const { project } = useWorkspace();
  const [settings, setSettings] = useState<AssistantAccessDto>({
    configured: false,
    grants: [],
  });
  const [token, setToken] = useState(""),
    [busy, setBusy] = useState(true),
    [origin, setOrigin] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void api.assistants
      .get(undefined, { signal: controller.signal })
      .then((access) => {
        setSettings(access);
        setOrigin(window.location.origin);
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          toast.error(userMessage(e, "Could not load assistant settings"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, []);
  // Runs a change, then reloads the settings.
  async function change(action: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await action();
      setSettings(await api.assistants.get());
      toast.success(done);
    } catch (e) {
      toast.error(userMessage(e, "Request failed"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div>
        <h1 className="display-m">Connect your assistant</h1>
        <p className="text-sm text-muted-foreground">
          Connect once and send drafts to any of your projects.
        </p>
      </div>
      <AssistantSettings
        project={project}
        endpoint={`${origin}/api/mcp`}
        token={token}
        busy={busy}
        configured={settings.configured}
        grants={settings.grants}
        onRotate={() =>
          void change(
            async () => setToken((await api.assistants.rotateToken()).mcpToken),
            "MCP token generated.",
          )
        }
        onRevoke={(clientId) =>
          change(
            () => api.assistants.revokeGrant({ clientId }),
            "Assistant disconnected.",
          )
        }
      />
    </>
  );
}
