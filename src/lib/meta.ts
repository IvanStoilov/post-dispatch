import { claimPost, saveDelivery, finishPublication } from "./store";
export function connections() {
  return {
    facebook: !!(
      process.env.FACEBOOK_PAGE_ID && process.env.FACEBOOK_PAGE_TOKEN
    ),
    instagram: !!(
      process.env.INSTAGRAM_ACCOUNT_ID && process.env.INSTAGRAM_ACCESS_TOKEN
    ),
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
export async function publishPost(id: string) {
  const post = await claimPost(id, connections());
  try {
    for (const target of post.platforms) {
      let publishedId: string;
      if (target === "facebook")
        publishedId = await graph(
          "graph.facebook.com",
          process.env.FACEBOOK_PAGE_ID!,
          post.imageUrl ? "photos" : "feed",
          process.env.FACEBOOK_PAGE_TOKEN!,
          post.imageUrl
            ? { url: post.imageUrl, caption: post.caption }
            : { message: post.caption },
        );
      else {
        const account = process.env.INSTAGRAM_ACCOUNT_ID!;
        const token = process.env.INSTAGRAM_ACCESS_TOKEN!;
        const host =
          process.env.INSTAGRAM_API_HOST === "graph.instagram.com"
            ? "graph.instagram.com"
            : "graph.facebook.com";
        const container = await graph(host, account, "media", token, {
          image_url: post.imageUrl,
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
