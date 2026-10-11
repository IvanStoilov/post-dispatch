import { config } from "../config";
import { loggedOperation, withLogSecrets } from "../logger";
import { setTimeout as delay } from "node:timers/promises";
import { metaRequest } from "../meta-client";
import { MediaPending, type PublishContext } from "./types";
function endpoint(host: string, id: string, edge = "") {
  return `https://${host}/${config.META_API_VERSION}/${id}${edge ? `/${edge}` : ""}`;
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
  durable = false,
) {
  return loggedOperation("waitForInstagramContainer", {}, async () => {
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
      if (durable) throw new MediaPending(60);
      if (attempt < 3) await delay(60000, undefined, { signal });
    }
    throw new Error(
      "Instagram is still processing the media. Check Meta before submitting again.",
    );
  });
}
export async function publishMeta({
  connection,
  post,
  assets,
  urls,
  signal,
  progress,
}: PublishContext) {
  return withLogSecrets([connection.accessToken], () =>
    loggedOperation(
      "publishMeta",
      {
        projectId: post.projectId,
        postId: post.id,
        provider: connection.provider,
      },
      async () => {
        const video = assets[0]?.kind === "VIDEO";
        const submit = async (
          host: string,
          id: string,
          edge: string,
          fields: Record<string, string>,
        ) => {
          await progress?.beforeSubmit();
          return graph(host, id, edge, connection.accessToken, fields, signal);
        };
        const checkpoint = async (state: import("./types").PublishState) => {
          if (progress) {
            await progress.checkpoint(state);
            progress.state = state;
          }
        };
        if (connection.provider === "facebook") {
          const page = connection.accountId,
            token = connection.accessToken;
          if (video)
            return submit("graph-video.facebook.com", page, "videos", {
              file_url: urls[0],
              description: post.caption,
            });
          if (urls.length > 1) {
            const photos = [...(progress?.state.mediaIds || [])];
            for (let i = photos.length; i < urls.length; i++) {
              photos.push(
                await graph(
                  "graph.facebook.com",
                  page,
                  "photos",
                  token,
                  { url: urls[i], published: "false" },
                  signal,
                ),
              );
              await checkpoint({ mediaIds: photos });
            }
            const fields: Record<string, string> = { message: post.caption };
            photos.forEach((photo, i) => {
              fields[`attached_media[${i}]`] = JSON.stringify({
                media_fbid: photo,
              });
            });
            return submit("graph.facebook.com", page, "feed", fields);
          }
          return submit(
            "graph.facebook.com",
            page,
            urls.length ? "photos" : "feed",
            urls.length
              ? { url: urls[0], caption: post.caption }
              : { message: post.caption },
          );
        }
        const host =
          connection.metadata.apiHost === "graph.instagram.com"
            ? "graph.instagram.com"
            : "graph.facebook.com";
        const account = connection.accountId,
          token = connection.accessToken;
        let container = progress?.state.containerId;
        if (!container) {
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
          } else if (urls.length > 1) {
            const children = [...(progress?.state.mediaIds || [])];
            for (let i = children.length; i < urls.length; i++) {
              children.push(
                await graph(
                  host,
                  account,
                  "media",
                  token,
                  { image_url: urls[i], is_carousel_item: "true" },
                  signal,
                ),
              );
              await checkpoint({ mediaIds: children });
            }
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
          } else {
            container = await graph(
              host,
              account,
              "media",
              token,
              { image_url: urls[0], caption: post.caption },
              signal,
            );
          }
          await checkpoint({ ...progress?.state, containerId: container });
        }
        if (video || urls.length > 1 || progress)
          await waitForInstagramContainer(
            host,
            container,
            token,
            signal,
            !!progress,
          );
        return submit(host, account, "media_publish", {
          creation_id: container,
        });
      },
    ),
  );
}
