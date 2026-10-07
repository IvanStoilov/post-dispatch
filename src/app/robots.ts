import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/public-site";
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/oauth/", "/connections/", "/signin", "/signup"],
    },
    sitemap: `${siteOrigin()}/sitemap.xml`,
  };
}
