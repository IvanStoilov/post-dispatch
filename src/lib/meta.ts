import {
  claimPost,
  saveDelivery,
  finishPublication,
  getPostImage,
  storedAssets,
} from "./store";
import { getProject, publicProject } from "./projects";
import { publicationImageUrl } from "./storage";
import { setTimeout as delay } from "node:timers/promises";
import { metaRequest } from "./meta-client";
import { withLogContext } from "./logger";
export async function connections(projectId: string) {
  const project = publicProject(await getProject(projectId));
  return {
    facebook: project.facebookConfigured,
    instagram: project.instagramConfigured,
    mcp: project.mcpConfigured,
  };
}
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
export async function publishPost(projectId: string, id: string) {
  return withLogContext({ projectId, postId: id }, () =>
    publish(projectId, id),
  );
}
async function publish(projectId: string, id: string) {
  const project = await getProject(projectId);
  const post = await claimPost(projectId, id, {
    facebook: !!(project.facebookPageId && project.facebookPageToken),
    instagram: !!(project.instagramAccountId && project.instagramAccessToken),
  });
  const signal = AbortSignal.timeout(240000);
  try {
    const media = await getPostImage(projectId, id);
    const assets = storedAssets(media);
    const urls: string[] = [];
    for (const asset of assets) urls.push(await publicationImageUrl(asset));
    if (!urls.length && media.imageUrl) urls.push(media.imageUrl);
    const video = assets[0]?.kind === "VIDEO";
    for (const target of post.platforms) {
      let publishedId: string;
      if (target === "facebook") {
        const page = project.facebookPageId,
          token = project.facebookPageToken;
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
        const account = project.instagramAccountId,
          token = project.instagramAccessToken;
        const host =
          project.instagramApiHost === "graph.instagram.com"
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
      await saveDelivery(id, target, publishedId);
    }
    return finishPublication(id, "published");
  } catch (error) {
    await finishPublication(
      id,
      "needs_review",
      `Publishing stopped. Check Meta before resubmitting to avoid duplicates. ${error instanceof Error ? error.message : "Unknown error"}`,
    );
    throw error;
  }
}
