import { z } from "zod";
import { setTimeout as delay } from "node:timers/promises";
import { logger, logContext, redact } from "../logger";
import { readImage } from "../storage";
import type { PublishContext } from "./types";

// Posts commentary uses LinkedIn's little Text Format, not raw plaintext.
const reservedTextCharacters = new Set("\\|{}@[]()<>#*_~");
export function escapeLinkedInText(text: string) {
  return Array.from(text, (character) =>
    reservedTextCharacters.has(character) ? `\\${character}` : character,
  ).join("");
}
export function linkedinScopes() {
  return [
    "openid",
    "profile",
    "w_member_social",
    ...(process.env.LINKEDIN_ORGANIZATION_POSTING === "true"
      ? ["w_organization_social", "rw_organization_admin"]
      : []),
  ];
}
export function linkedinConfig() {
  const id = process.env.LINKEDIN_CLIENT_ID;
  const secret = process.env.LINKEDIN_CLIENT_SECRET;
  if (!id || !secret)
    throw new Error(
      "Configure LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET on the server.",
    );
  return { id, secret };
}
export async function linkedinRequest<T>(
  path: string,
  token: string,
  signal: AbortSignal,
  body?: unknown,
) {
  const url = `https://api.linkedin.com${path}`;
  const details = {
    ...logContext(),
    provider: "linkedin",
    path,
    method: body ? "POST" : "GET",
  };
  logger.debug(
    "connector.request",
    redact({ ...details, body }, [token]) as Record<string, unknown>,
  );
  const response = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "LinkedIn-Version": process.env.LINKEDIN_API_VERSION || "202605",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
    signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]),
  });
  const text = await response.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error("LinkedIn returned an invalid response.");
  }
  logger.debug(
    "connector.response",
    redact({ ...details, status: response.status, body: data }, [
      token,
    ]) as Record<string, unknown>,
  );
  if (!response.ok)
    throw new Error(
      `LinkedIn rejected the request (${response.status}). Check permissions, account access, and token expiry.`,
    );
  return { data: data as T, response };
}
export type LinkedInAccount = {
  id: string;
  name: string;
  access_token: string;
  expiresAt: string;
  scopes: string[];
};
export async function linkedinAccounts(
  code: string,
  callback: string,
): Promise<LinkedInAccount[]> {
  const config = linkedinConfig();
  const response = await fetch(
    "https://www.linkedin.com/oauth/v2/accessToken",
    {
      method: "POST",
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: callback,
        client_id: config.id,
        client_secret: config.secret,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    },
  );
  if (!response.ok)
    throw new Error("LinkedIn rejected the connection. Start again.");
  const token = z
    .object({
      access_token: z.string().min(1),
      expires_in: z.number().positive(),
      scope: z.string().optional(),
    })
    .parse(await response.json());
  const scopes = token.scope ? token.scope.split(/[ ,]+/) : linkedinScopes();
  if (!scopes.includes("w_member_social"))
    throw new Error("Grant LinkedIn publishing permission and reconnect.");
  const signal = AbortSignal.timeout(60000);
  const { data: profile } = await linkedinRequest<{
    sub: string;
    name?: string;
  }>("/v2/userinfo", token.access_token, signal);
  const accounts: LinkedInAccount[] = [
    {
      id: `urn:li:person:${z.string().min(1).parse(profile.sub)}`,
      name: profile.name || "Personal profile",
      access_token: token.access_token,
      expiresAt: new Date(Date.now() + token.expires_in * 1000).toISOString(),
      scopes,
    },
  ];
  if (
    scopes.includes("w_organization_social") &&
    scopes.includes("rw_organization_admin")
  ) {
    const seen = new Set<string>();
    for (let start = 0; start < 2000; start += 100) {
      const { data } = await linkedinRequest<{
        elements: { state: string; role: string; organizationTarget: string }[];
        paging?: { links?: { rel: string }[] };
      }>(
        `/rest/organizationAcls?q=roleAssignee&state=APPROVED&count=100&start=${start}`,
        token.access_token,
        signal,
      );
      for (const acl of data.elements) {
        if (
          acl.state !== "APPROVED" ||
          !["ADMINISTRATOR", "CONTENT_ADMIN", "CONTENT_ADMINISTRATOR"].includes(
            acl.role,
          ) ||
          seen.has(acl.organizationTarget)
        )
          continue;
        const match = /^urn:li:organization:(\d+)$/.exec(
          acl.organizationTarget,
        );
        if (!match) continue;
        seen.add(acl.organizationTarget);
        const { data: organization } = await linkedinRequest<{
          localizedName?: string;
        }>(`/rest/organizations/${match[1]}`, token.access_token, signal);
        accounts.push({
          ...accounts[0],
          id: acl.organizationTarget,
          name: organization.localizedName || `Company ${match[1]}`,
        });
      }
      if (!data.paging?.links?.some((l) => l.rel === "next")) return accounts;
    }
    throw new Error("Too many LinkedIn Pages. Limit app access and reconnect.");
  }
  return accounts;
}
export function linkedinUploadUrl(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !(url.hostname === "linkedin.com" || url.hostname.endsWith(".linkedin.com"))
  )
    throw new Error("LinkedIn returned an invalid upload URL.");
  return url.toString();
}
async function upload(
  url: string,
  bytes: Uint8Array,
  token: string,
  signal: AbortSignal,
  mime: string,
) {
  const response = await fetch(linkedinUploadUrl(url), {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": mime },
    body: Buffer.from(bytes),
    signal,
    redirect: "error",
  });
  logger.debug("connector.upload", {
    ...logContext(),
    provider: "linkedin",
    status: response.status,
    bytes: bytes.length,
  });
  if (!response.ok)
    throw new Error(`LinkedIn media upload failed (${response.status}).`);
  return response;
}
export async function publishLinkedIn({
  connection,
  post,
  assets,
  urls,
  signal,
}: PublishContext) {
  if (!/^urn:li:(person|organization):[\w-]+$/.test(connection.accountId))
    throw new Error("Invalid LinkedIn account. Reconnect it.");
  const token = connection.accessToken;
  const ids: string[] = [];
  for (const asset of assets) {
    const bytes = await readImage(asset);
    ids.push(
      await uploadLinkedInAsset(
        connection.accountId,
        token,
        bytes,
        asset.kind,
        signal,
      ),
    );
  }
  if (!assets.length && urls.length)
    throw new Error(
      "Re-upload this post’s image before publishing to LinkedIn.",
    );
  const { response } = await linkedinRequest("/rest/posts", token, signal, {
    author: connection.accountId,
    commentary: escapeLinkedInText(post.caption),
    visibility: "PUBLIC",
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
    distribution: {
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    ...(ids.length > 1
      ? { content: { multiImage: { images: ids.map((id) => ({ id })) } } }
      : ids.length
        ? { content: { media: { id: ids[0], title: post.title } } }
        : {}),
  });
  const id = response.headers.get("x-restli-id");
  if (!id)
    throw new Error(
      "LinkedIn did not return a post ID. Check before resubmitting.",
    );
  return id;
}

export async function uploadLinkedInAsset(
  owner: string,
  token: string,
  bytes: Uint8Array,
  kind: "IMAGE" | "VIDEO",
  signal: AbortSignal,
): Promise<string> {
  if (kind === "IMAGE") {
    const { data } = await linkedinRequest<{
      value: { uploadUrl: string; image: string };
    }>("/rest/images?action=initializeUpload", token, signal, {
      initializeUploadRequest: { owner: owner },
    });
    await upload(data.value.uploadUrl, bytes, token, signal, "image/jpeg");
    return data.value.image;
  } else {
    const { data } = await linkedinRequest<{
      value: {
        video: string;
        uploadToken: string;
        uploadInstructions: {
          firstByte: number;
          lastByte: number;
          uploadUrl: string;
        }[];
      };
    }>("/rest/videos?action=initializeUpload", token, signal, {
      initializeUploadRequest: {
        owner: owner,
        fileSizeBytes: bytes.length,
        uploadCaptions: false,
        uploadThumbnail: false,
      },
    });
    const parts: string[] = [];
    let offset = 0;
    for (const part of data.value.uploadInstructions) {
      if (
        part.firstByte !== offset ||
        part.lastByte < offset ||
        part.lastByte >= bytes.length
      )
        throw new Error("Invalid LinkedIn video upload ranges.");
      const r = await upload(
        part.uploadUrl,
        bytes.subarray(part.firstByte, part.lastByte + 1),
        token,
        signal,
        "application/octet-stream",
      );
      const etag = r.headers.get("etag");
      if (!etag)
        throw new Error("LinkedIn did not return a video upload receipt.");
      parts.push(etag.replace(/^"|"$/g, ""));
      offset = part.lastByte + 1;
    }
    if (offset !== bytes.length)
      throw new Error("Incomplete LinkedIn video upload.");
    await linkedinRequest("/rest/videos?action=finalizeUpload", token, signal, {
      finalizeUploadRequest: {
        video: data.value.video,
        uploadToken: data.value.uploadToken,
        uploadedPartIds: parts,
      },
    });
    let ready = false;
    for (let attempt = 0; attempt < 18; attempt++) {
      const { data: video } = await linkedinRequest<{ status: string }>(
        `/rest/videos/${encodeURIComponent(data.value.video)}`,
        token,
        signal,
      );
      if (video.status === "AVAILABLE") {
        ready = true;
        break;
      }
      if (!["PROCESSING", "WAITING_UPLOAD"].includes(video.status))
        throw new Error("LinkedIn video processing failed.");
      await delay(5000, undefined, { signal });
    }
    if (!ready)
      throw new Error(
        "LinkedIn is still processing the video. Check before resubmitting.",
      );
    return data.value.video;
  }
}
