import { setTimeout as delay } from "node:timers/promises";
import { metaRequest } from "../meta-client";
import type { PublishContext } from "./types";
function endpoint(host: string, id: string, edge = "") {
  return `https://${host}/${process.env.META_API_VERSION || "v25.0"}/${id}${edge ? `/${edge}` : ""}`;
}
async function graph(
  host: string,
  id: string,
  edge: string,
  token: string,
  fields: Record<string, string>,
  signal: AbortSignal,
) {
  const { response, data } = await metaRequest(
    endpoint(host, id, edge),
    token,
    signal,
    fields,
  );
  if (!response.ok || data.error)
    throw new Error(data.error?.message || "Meta rejected the request");
  if (!data.id) throw new Error("Meta did not return a post ID");
  return data.id as string;
}
// Video and carousel containers are asynchronous. Do not publish until Meta
// confirms readiness; each check is at least one minute apart as recommended.
export async function waitForInstagramContainer(
  host: string,
  id: string,
  token: string,
  signal: AbortSignal,
) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { response, data } = await metaRequest(
      `${endpoint(host, id)}?fields=status_code,status`,
      token,
      signal,
    );
    if (!response.ok || data.error)
      throw new Error(
        data.error?.message || "Could not check Instagram media processing",
      );
    if (data.status_code === "FINISHED") return;
    if (data.status_code !== "IN_PROGRESS")
      throw new Error(
        data.status ||
          `Instagram media processing failed (${data.status_code || "unknown status"})`,
      );
    if (attempt < 3) await delay(60000, undefined, { signal });
  }
  throw new Error(
    "Instagram is still processing the media. Check Meta before submitting again.",
  );
}
export async function publishMeta({
  connection,
  post,
  assets,
  urls,
  signal,
}: PublishContext) {
  const video = assets[0]?.kind === "VIDEO";
  let publishedId: string;
  if (connection.provider === "facebook") {
    const page = connection.accountId,
      token = connection.accessToken;
    if (video)
      publishedId = await graph(
        "graph-video.facebook.com",
        page,
        "videos",
        token,
        { file_url: urls[0], description: post.caption },
        signal,
      );
    else if (urls.length > 1) {
      const fields: Record<string, string> = { message: post.caption };
      for (const [index, url] of urls.entries()) {
        const photo = await graph(
          "graph.facebook.com",
          page,
          "photos",
          token,
          { url, published: "false" },
          signal,
        );
        fields[`attached_media[${index}]`] = JSON.stringify({
          media_fbid: photo,
        });
      }
      publishedId = await graph(
        "graph.facebook.com",
        page,
        "feed",
        token,
        fields,
        signal,
      );
    } else
      publishedId = await graph(
        "graph.facebook.com",
        page,
        urls.length ? "photos" : "feed",
        token,
        urls.length
          ? { url: urls[0], caption: post.caption }
          : { message: post.caption },
        signal,
      );
  } else {
    const account = connection.accountId,
      token = connection.accessToken;
    const host =
      connection.metadata.apiHost === "graph.instagram.com"
        ? "graph.instagram.com"
        : "graph.facebook.com";
    let container: string;
    if (video) {
      container = await graph(
        host,
        account,
        "media",
        token,
        {
          media_type: "REELS",
          video_url: urls[0],
          caption: post.caption,
          share_to_feed: "true",
        },
        signal,
      );
      await waitForInstagramContainer(host, container, token, signal);
    } else if (urls.length > 1) {
      const children: string[] = [];
      for (const url of urls)
        children.push(
          await graph(
            host,
            account,
            "media",
            token,
            { image_url: url, is_carousel_item: "true" },
            signal,
          ),
        );
      container = await graph(
        host,
        account,
        "media",
        token,
        {
          media_type: "CAROUSEL",
          children: children.join(","),
          caption: post.caption,
        },
        signal,
      );
      await waitForInstagramContainer(host, container, token, signal);
    } else
      container = await graph(
        host,
        account,
        "media",
        token,
        { image_url: urls[0], caption: post.caption },
        signal,
      );
    publishedId = await graph(
      host,
      account,
      "media_publish",
      token,
      { creation_id: container },
      signal,
    );
  }
  return publishedId;
}
