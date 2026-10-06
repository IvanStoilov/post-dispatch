import { claimPost, saveDelivery, finishPublication } from "./store";
import { getProject, publicProject } from "./projects";
import { getPostImage } from "./store";
import { publicationImageUrl } from "./storage";
export async function connections(projectId: string) {
  const project = publicProject(await getProject(projectId));
  return {
    facebook: project.facebookConfigured,
    instagram: project.instagramConfigured,
    mcp: project.mcpConfigured,
  };
}
async function graph(
  host: string,
  id: string,
  endpoint: string,
  token: string,
  fields: Record<string, string>,
) {
  const response = await fetch(
    `https://${host}/${process.env.META_API_VERSION || "v25.0"}/${id}/${endpoint}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: new URLSearchParams(fields),
      signal: AbortSignal.timeout(30000),
    },
  );
  const data = await response.json();
  if (!response.ok || data.error)
    throw new Error(data.error?.message || "Meta rejected the request");
  if (!data.id) throw new Error("Meta did not return a post ID");
  return data.id as string;
}
export async function publishPost(projectId: string, id: string) {
  const project = await getProject(projectId);
  const post = await claimPost(projectId, id, {
    facebook: !!(project.facebookPageId && project.facebookPageToken),
    instagram: !!(project.instagramAccountId && project.instagramAccessToken),
  });
  try {
    const media = await getPostImage(projectId, id);
    const imageUrl =
      media.imageKey && media.imageBucket
        ? await publicationImageUrl({
            imageKey: media.imageKey,
            imageBucket: media.imageBucket,
          })
        : media.imageUrl;
    for (const target of post.platforms) {
      let publishedId: string;
      if (target === "facebook")
        publishedId = await graph(
          "graph.facebook.com",
          project.facebookPageId,
          imageUrl ? "photos" : "feed",
          project.facebookPageToken,
          imageUrl
            ? { url: imageUrl, caption: post.caption }
            : { message: post.caption },
        );
      else {
        const account = project.instagramAccountId;
        const token = project.instagramAccessToken;
        const host =
          project.instagramApiHost === "graph.instagram.com"
            ? "graph.instagram.com"
            : "graph.facebook.com";
        const container = await graph(host, account, "media", token, {
          image_url: imageUrl,
          caption: post.caption,
        });
        publishedId = await graph(host, account, "media_publish", token, {
          creation_id: container,
        });
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
