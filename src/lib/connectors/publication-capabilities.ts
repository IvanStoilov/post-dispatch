import type { Publication } from "../types";
export function publicationCapabilities(
  publication: Pick<
    Publication,
    "platform" | "mediaKind" | "accountId" | "status"
  >,
) {
  const active = !!publication.accountId && publication.status !== "deleted";
  return {
    refresh: active && publication.platform !== "linkedin",
    edit:
      active &&
      (publication.platform === "linkedin" ||
        (publication.platform === "facebook" &&
          ["TEXT", "CAROUSEL"].includes(publication.mediaKind))),
    delete: active && publication.platform !== "instagram",
  };
}
export function safePublicationLink(
  platform: Publication["platform"],
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const domain = {
      facebook: "facebook.com",
      instagram: "instagram.com",
      linkedin: "linkedin.com",
    }[platform];
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      (url.hostname === domain || url.hostname.endsWith(`.${domain}`))
      ? url.href
      : null;
  } catch {
    return null;
  }
}
