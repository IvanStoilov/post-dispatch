import type { MetadataRoute } from "next";
import { brand } from "@/lib/brand";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: brand.name,
    short_name: brand.name,
    description: brand.description,
    start_url: "/",
    display: "browser",
    background_color: "#FBF7EE",
    theme_color: "#FFC531",
    icons: [
      {
        src: "/brand/app-icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
