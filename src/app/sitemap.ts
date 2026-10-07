import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/public-site";
import { publicPages } from "@/lib/public-routes";
export default function sitemap(): MetadataRoute.Sitemap {
  return publicPages.map((path) => ({
    url: `${siteOrigin()}${path === "/" ? "" : path}`,
    changeFrequency: path === "/" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : 0.5,
  }));
}
