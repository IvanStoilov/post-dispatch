import type { Platform } from "../types";
import type { ConnectorAdapter } from "./types";
import { publishMeta } from "./meta";
import { publishLinkedIn } from "./linkedin";
export const connectors: Record<Platform, ConnectorAdapter> = {
  facebook: {
    publish: publishMeta,
    capabilities: { text: true, images: 10, video: true },
  },
  instagram: {
    publish: publishMeta,
    capabilities: { text: false, images: 10, video: true },
  },
  linkedin: {
    publish: publishLinkedIn,
    capabilities: { text: true, images: 10, video: true },
  },
};
