export const platforms = ["facebook", "instagram", "linkedin"] as const;
export type Platform = (typeof platforms)[number];
