import {
  facebookPublications,
  instagramPublications,
  linkedinPublications,
} from "./publication-adapters";
import type { Platform } from "../types";
import type { ConnectorAdapter } from "./types";
import { publishMeta } from "./meta";
import { publishLinkedIn } from "./linkedin";

export const connectors: Record<Platform, ConnectorAdapter> = {
  facebook: {
    publications: facebookPublications,
    publish: publishMeta,
    capabilities: { text: true, images: 10, video: true },
  },
  instagram: {
    publications: instagramPublications,
    publish: publishMeta,
    capabilities: { text: false, images: 10, video: true },
  },
  linkedin: {
    publications: linkedinPublications,
    publish: publishLinkedIn,
    capabilities: { text: true, images: 10, video: true },
  },
};
