import "server-only";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { linkedinAccounts, linkedinScopes } from "@/lib/connectors/linkedin";
import {
  ConnectorAuthError,
  connectorConfig,
  facebookPages,
  instagramAccount,
  metaApiVersion,
} from "@/lib/connectors/meta-oauth";
import { loggedOperation } from "@/lib/logger";
import type { Platform } from "@/shared/platforms";
import { projectsSystemService } from "../projects";
import type { Actor } from "../shared/actor";
import type { Executor } from "../shared/db";
import { UserFacingError } from "../shared/errors";
import {
  belongsTo,
  PENDING_LIFETIME_SECONDS,
  seal,
  unseal,
  type PendingConnection,
} from "./pending";
import * as repository from "./repository";

// Connecting a project's channel over OAuth. A flow is bound to the user,
// the browser session that started it and the project:
// 1. start: returns the provider's authorization URL; the transport keeps
//    the flow's nonce in a cookie and the provider echoes it as `state`.
// 2. complete (the provider's callback): exchanges the code. Instagram is
//    saved right away; Facebook and LinkedIn offer a choice of accounts.
// 3. listAccounts / selectAccount: the user picks which account to save.
// Every step re-checks project ownership; each flow step works only once.

// Connect flows are tied to the browser session, not just the user.
export type SessionActor = Actor & { sessionId: string };
type Selectable = "facebook" | "linkedin";

const expired = () =>
  new UserFacingError("Connection expired. Start again.", 400);

// Provider refusals (missing permission, no Pages) are shown to the user.
async function withProviderErrors<T>(action: () => Promise<T>) {
  try {
    return await action();
  } catch (error) {
    if (error instanceof ConnectorAuthError)
      throw new UserFacingError(error.message, 400);
    throw error;
  }
}

async function assertOwned(userId: string, projectId: string) {
  if (!(await projectsSystemService.isOwned(userId, projectId)))
    throw new UserFacingError("Project not found", 404);
}

async function savePending(value: PendingConnection) {
  const nonce = randomBytes(32).toString("base64url");
  await repository.insertPending(nonce, seal(value), PENDING_LIFETIME_SECONDS);
  return nonce;
}

// The flow behind `nonce`, if it belongs to this session and step. With
// `consume`, it can't be used again.
async function takePending(
  actor: SessionActor,
  provider: Platform,
  phase: PendingConnection["phase"],
  nonce: string,
  consume: boolean,
) {
  if (!/^[\w-]{43}$/.test(nonce)) throw expired();
  const row = await repository.findPending(nonce);
  if (!row) throw expired();
  const value = unseal(row.value);
  if (
    value.provider !== provider ||
    value.phase !== phase ||
    value.userId !== actor.userId ||
    value.sessionId !== actor.sessionId
  )
    throw new UserFacingError(
      "Connection does not belong to this session.",
      403,
    );
  await assertOwned(value.userId, value.projectId);
  if (consume && !(await repository.claimPending(row.id, nonce)))
    throw new UserFacingError(
      "Connection already completed. Start again.",
      409,
    );
  return value;
}

async function start(
  actor: SessionActor,
  { projectId, provider }: { projectId: string; provider: Platform },
): Promise<{ url: string; nonce: string }> {
  return loggedOperation(
    "domain.connections.start",
    { userId: actor.userId, projectId, provider },
    async () => {
      await assertOwned(actor.userId, projectId);
      const config = await withProviderErrors(async () =>
        connectorConfig(provider),
      );
      const nonce = await savePending({
        provider,
        projectId,
        userId: actor.userId,
        sessionId: actor.sessionId,
        phase: "authorize",
      });
      const url = new URL(
        provider === "facebook"
          ? `https://www.facebook.com/${metaApiVersion()}/dialog/oauth`
          : provider === "linkedin"
            ? "https://www.linkedin.com/oauth/v2/authorization"
            : "https://www.instagram.com/oauth/authorize",
      );
      url.search = new URLSearchParams({
        client_id: config.id,
        redirect_uri: config.callback,
        response_type: "code",
        state: nonce,
        scope:
          provider === "facebook"
            ? "pages_show_list,pages_read_engagement,pages_manage_posts"
            : provider === "linkedin"
              ? linkedinScopes().join(" ")
              : "instagram_business_basic,instagram_business_content_publish",
        ...(provider === "facebook"
          ? { auth_type: "rerequest" }
          : provider === "instagram"
            ? { enable_fb_login: "0" }
            : {}),
      }).toString();
      return { url: url.toString(), nonce };
    },
  );
}

// The provider's callback. `nonce` is the flow's cookie, `state` what the
// provider sent back; they must match.
async function complete(
  actor: SessionActor,
  input: {
    provider: Platform;
    nonce: string;
    state: string | null;
    code: string | null;
    error: string | null;
  },
): Promise<
  | { projectId: string; outcome: "connected" | "cancelled" }
  | { projectId: string; outcome: "select"; nonce: string }
> {
  const { provider } = input;
  return loggedOperation(
    "domain.connections.complete",
    { userId: actor.userId, provider },
    async () => {
      if (!input.nonce || input.state !== input.nonce)
        throw new UserFacingError(
          "Invalid OAuth state. Start the connection again.",
          400,
        );
      const value = await takePending(
        actor,
        provider,
        "authorize",
        input.nonce,
        true,
      );
      const { projectId } = value;
      if (input.error !== null) return { projectId, outcome: "cancelled" };
      const code = z.string().min(1).max(4096).safeParse(input.code);
      if (!code.success)
        throw new UserFacingError(
          "The provider didn't return an authorization code. Start again.",
          400,
        );
      return withProviderErrors(async () => {
        if (provider === "facebook") {
          const pages = await facebookPages(code.data);
          const nonce = await savePending({ ...value, phase: "select", pages });
          return { projectId, outcome: "select" as const, nonce };
        }
        if (provider === "linkedin") {
          const accounts = await linkedinAccounts(
            code.data,
            connectorConfig(provider).callback,
          );
          const nonce = await savePending({
            ...value,
            phase: "select",
            linkedin: accounts,
          });
          return { projectId, outcome: "select" as const, nonce };
        }
        const account = await instagramAccount(code.data);
        await projectsSystemService.saveConnector(value.userId, projectId, {
          provider: "instagram",
          accountId: account.id,
          accountName: account.name,
          accessToken: account.token,
          scopes: [
            "instagram_business_basic",
            "instagram_business_content_publish",
          ],
          metadata: { apiHost: "graph.instagram.com" },
        });
        return { projectId, outcome: "connected" as const };
      });
    },
  );
}

const offered = (value: PendingConnection) =>
  (value.provider === "facebook" ? value.pages : value.linkedin) ?? [];

// The accounts the provider offered, without their tokens.
async function listAccounts(
  actor: SessionActor,
  { provider, nonce }: { provider: Selectable; nonce: string },
) {
  const value = await takePending(actor, provider, "select", nonce, false);
  const project = await projectsSystemService.findRecord(value.projectId);
  return {
    projectId: value.projectId,
    projectName: project!.name,
    pages: offered(value).map(({ id, name }) => ({ id, name })),
  };
}

async function selectAccount(
  actor: SessionActor,
  {
    provider,
    nonce,
    accountId,
  }: { provider: Selectable; nonce: string; accountId: string },
): Promise<{ projectId: string }> {
  return loggedOperation(
    "domain.connections.selectAccount",
    { userId: actor.userId, provider },
    async () => {
      const value = await takePending(actor, provider, "select", nonce, false);
      if (provider === "facebook") {
        const page = value.pages?.find((item) => item.id === accountId);
        if (!page)
          throw new UserFacingError(
            "Select a Page from the authorized list.",
            400,
          );
        await takePending(actor, provider, "select", nonce, true);
        await projectsSystemService.saveConnector(
          value.userId,
          value.projectId,
          {
            provider: "facebook",
            accountId: page.id,
            accountName: page.name,
            accessToken: page.access_token,
            refreshToken: null,
            expiresAt: null,
            metadata: {},
          },
        );
      } else {
        const account = value.linkedin?.find((a) => a.id === accountId);
        if (!account)
          throw new UserFacingError(
            "Choose an authorized LinkedIn account.",
            400,
          );
        await takePending(actor, provider, "select", nonce, true);
        await projectsSystemService.saveConnector(
          value.userId,
          value.projectId,
          {
            provider: "linkedin",
            accountId: account.id,
            accountName: account.name,
            accessToken: account.access_token,
            expiresAt: new Date(account.expiresAt),
            scopes: account.scopes,
            refreshToken: null,
            metadata: {},
          },
        );
      }
      return { projectId: value.projectId };
    },
  );
}

// Removes the user's unfinished flows (for one project, or all of them).
async function deletePending(db: Executor, userId: string, projectId?: string) {
  const rows = await repository.listAllPending(db);
  await repository.deleteByIds(
    db,
    rows
      .filter((row) => belongsTo(row.value, userId, projectId))
      .map((row) => row.id),
  );
}

// For transports acting for a signed-in user's browser session.
export const connectionsService = {
  start,
  complete,
  listAccounts,
  selectAccount,
};

// For workers and other domain modules only: these skip user
// authorization. Lint forbids them in routers and UI.
export const connectionsSystemService = {
  // Project and account deletion, in their transactions.
  deletePending,
};
