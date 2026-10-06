"use client";
import { useState } from "react";
import type { PostAsset } from "@/lib/types";
export default function MediaGallery({
  assets,
  title,
}: {
  assets: PostAsset[];
  title: string;
}) {
  const [selected, setSelected] = useState(0);
  const asset = assets[Math.min(selected, assets.length - 1)];
  if (!asset) return null;
  return (
    <div className="media-gallery">
      {asset.kind === "VIDEO" ? (
        <video
          key={asset.id}
          src={asset.url}
          controls
          playsInline
          preload="metadata"
          aria-label={`${title} video`}
        />
      ) : (
        <img
          src={asset.url}
          className="gallery-image object-contain h-full w-auto"
          role="img"
          aria-label={`${title}, image ${selected + 1} of ${assets.length}`}
        />
      )}
      {assets.length > 1 && (
        <div className="gallery-navigation" aria-label="Post images">
          {assets.map((item, index) => (
            <button
              key={item.id}
              type="button"
              aria-label={`Show image ${index + 1}`}
              aria-pressed={index === selected}
              onClick={() => setSelected(index)}
            >
              {index + 1}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
