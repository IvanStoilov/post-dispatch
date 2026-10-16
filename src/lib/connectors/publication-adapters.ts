import { config } from "../config";
import { metaRequest } from "../meta-client";
import { linkedinRequest, escapeLinkedInText } from "./linkedin";
import type { PublicationAdapter, PublicationContext } from "./types";

async function meta(
  context: PublicationContext,
  fields?: Record<string, string>,
  method?: "POST" | "DELETE",
) {
  const { connection, publication, signal } = context;
  const host =
    publication.platform === "instagram" &&
    connection.metadata.apiHost === "graph.instagram.com"
      ? "graph.instagram.com"
      : "graph.facebook.com";
  const url = new URL(
    `https://${host}/${config.META_API_VERSION}/${encodeURIComponent(publication.remotePostId)}`,
  );
  if (!method) {
    url.searchParams.set(
      "fields",
      publication.platform === "instagram"
        ? "id,permalink,like_count,comments_count"
        : publication.mediaKind === "IMAGE" &&
            !publication.remotePostId.includes("_")
          ? "id,link,reactions.limit(0).summary(true),comments.limit(0).summary(true)"
          : publication.mediaKind === "UNKNOWN"
            ? "id"
            : "id,permalink_url,reactions.limit(0).summary(true),comments.limit(0).summary(true)",
    );
  }
  const { response, data } = await metaRequest(
    url.href,
    connection.accessToken,
    signal,
    fields,
    method,
  );
  if (!response.ok || data.error) {
    throw new Error(
      data.error?.message ||
        "The network rejected the request. Check account permissions.",
    );
  }
  return data as Record<string, unknown>;
}
function count(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}
function summary(value: unknown): number | undefined {
  return count(
    (value as { summary?: { total_count?: unknown } } | undefined)?.summary
      ?.total_count,
  );
}
const getMeta: NonNullable<PublicationAdapter["get"]> = async (context) => {
  const data = await meta(context);
  const metrics: Record<string, number> = {};
  const values =
    context.publication.platform === "instagram"
      ? { likes: count(data.like_count), comments: count(data.comments_count) }
      : {
          reactions: summary(data.reactions),
          comments: summary(data.comments),
        };
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) {
      metrics[key] = value;
    }
  }
  const link = data.permalink || data.permalink_url || data.link;
  return {
    permalink:
      typeof link === "string"
        ? link
        : context.publication.platform === "facebook"
          ? `https://www.facebook.com/${encodeURIComponent(context.publication.remotePostId)}`
          : undefined,
    metrics,
  };
};
function confirmed(data: unknown): boolean {
  return (
    data === true ||
    !!(
      data &&
      typeof data === "object" &&
      "success" in data &&
      data.success === true
    )
  );
}
export const facebookPublications: PublicationAdapter = {
  get: getMeta,
  update: async (context, caption) => {
    if (!confirmed(await meta(context, { message: caption }, "POST"))) {
      throw new Error(
        "Facebook did not confirm the update. Check the original post.",
      );
    }
  },
  delete: async (context) => {
    const data = await meta(context, undefined, "DELETE");
    if (!confirmed(data)) {
      throw new Error(
        "Facebook did not confirm deletion. Check the original post.",
      );
    }
  },
};
export const instagramPublications: PublicationAdapter = { get: getMeta };
export const linkedinPublications: PublicationAdapter = {
  update: async (context, caption) => {
    await linkedinRequest(
      `/rest/posts/${encodeURIComponent(context.publication.remotePostId)}`,
      context.connection.accessToken,
      context.signal,
      { patch: { $set: { commentary: escapeLinkedInText(caption) } } },
      { restliMethod: "PARTIAL_UPDATE" },
    );
  },
  delete: async (context) => {
    await linkedinRequest(
      `/rest/posts/${encodeURIComponent(context.publication.remotePostId)}`,
      context.connection.accessToken,
      context.signal,
      undefined,
      { method: "DELETE", restliMethod: "DELETE" },
    );
  },
};
