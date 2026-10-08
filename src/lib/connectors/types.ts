import type { ConnectorRow } from "../../db/schema";
import type { Post, StoredAsset } from "../types";
export type PublishState = {
  mediaIds?: string[];
  containerId?: string;
  videoId?: string;
};
export class MediaPending extends Error {
  constructor(readonly delaySeconds = 60) {
    super("Media is still processing");
  }
}
export type PublishProgress = {
  state: PublishState;
  checkpoint: (state: PublishState) => Promise<void>;
  beforeSubmit: () => Promise<void>;
};
export type PublishContext = {
  progress?: PublishProgress;
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
