import type { Platform } from "../types";

export function connectedAccountUrl(
  provider: Platform,
  account: {
    accountId: string;
    accountName: string;
  },
): string | null {
  if (provider === "facebook" && /^\d+$/.test(account.accountId)) {
    return `https://www.facebook.com/${account.accountId}`;
  }
  if (provider === "instagram") {
    const username = account.accountName.replace(/^@/, "");
    if (
      username !== account.accountId &&
      /^[a-zA-Z0-9._]{1,30}$/.test(username)
    ) {
      return `https://www.instagram.com/${username}/`;
    }
  }
  if (provider === "linkedin") {
    const organization = /^urn:li:organization:(\d+)$/.exec(account.accountId);
    if (organization) {
      return `https://www.linkedin.com/company/${organization[1]}/`;
    }
  }
  return null;
}
