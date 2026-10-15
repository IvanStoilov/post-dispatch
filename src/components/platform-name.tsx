export function PlatformName({ platform }: { platform: string }) {
  const platformLabels: Record<string, string> = {
    twitter: "Twitter",
    facebook: "Facebook",
    instagram: "Instagram",
    linkedin: "LinkedIn",
  };
  return platformLabels[platform] ?? platform;
}
