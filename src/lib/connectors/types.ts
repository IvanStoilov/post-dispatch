import type { ConnectorRow } from "../../db/schema";
import type { Post, StoredAsset } from "../types";
export type PublishContext = {
  connection: ConnectorRow;
  post: Post;
  assets: StoredAsset[];
  urls: string[];
  signal: AbortSignal;
};
export type ConnectorAdapter = {
  publish: (context: PublishContext) => Promise<string>;
  capabilities: { text: boolean; images: number; video: boolean };
};
