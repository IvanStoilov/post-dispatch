import {
  claimPost,
  saveDelivery,
  finishPublication,
  getPostImage,
  storedAssets,
} from "./store";
import { getProject, isConnected } from "./projects";
import { publicationImageUrl } from "./storage";
import { withLogContext } from "./logger";
import { connectors } from "./connectors/registry";
import { platforms } from "./types";
import { accountTokenConfigured } from "./mcp-account";
export async function connections(projectId: string) {
  const project = await getProject(projectId);
  return {
    ...Object.fromEntries(
      platforms.map((p) => [
        p,
        project.connections.some((c) => c.provider === p && isConnected(c)),
      ]),
    ),
    mcp: await accountTokenConfigured(project.userId),
  };
}
export async function publishPost(projectId: string, id: string) {
  return withLogContext({ projectId, postId: id }, async () => {
    const project = await getProject(projectId);
    const connected = Object.fromEntries(
      project.connections.map((c) => [c.provider, isConnected(c)]),
    );
    const post = await claimPost(projectId, id, connected);
    const signal = AbortSignal.timeout(240000);
    try {
      const media = await getPostImage(projectId, id);
      const assets = storedAssets(media);
      const urls: string[] = [];
      for (const asset of assets) urls.push(await publicationImageUrl(asset));
      if (!urls.length && media.imageUrl) urls.push(media.imageUrl);
      // Validate every destination before making any irreversible provider call.
      for (const target of post.platforms) {
        const capability = connectors[target].capabilities;
        if (!capability.text && !urls.length)
          throw new Error(`${target} requires media`);
        if (urls.length > capability.images)
          throw new Error(`Too many images for ${target}`);
        if (
          assets.some((a) => a.kind === "VIDEO") &&
          (!capability.video || assets.length !== 1)
        )
          throw new Error(`Unsupported video combination for ${target}`);
      }
      for (const target of post.platforms) {
        const connection = project.connections.find(
          (c) => c.provider === target,
        )!;
        const remoteId = await connectors[target].publish({
          connection,
          post,
          assets,
          urls,
          signal,
        });
        await saveDelivery(id, target, remoteId);
      }
      return finishPublication(id, "published");
    } catch (error) {
      await finishPublication(
        id,
        "needs_review",
        `Publishing stopped. Check the selected networks before resubmitting to avoid duplicates. ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      throw error;
    }
  });
}
