"use client";
import { useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Images } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { PostAsset } from "@/lib/types";
export default function MediaGallery({
  assets,
  title,
}: {
  assets: PostAsset[];
  title: string;
}) {
  const [selected, setSelected] = useState(0);
  const index = Math.min(selected, assets.length - 1);
  const asset = assets[index];
  if (!asset) return null;
  return (
    <div className="relative flex aspect-4/3 w-full items-center justify-center overflow-hidden bg-muted">
      {asset.kind === "VIDEO" ? (
        <video
          key={asset.id}
          src={asset.url}
          className="size-full object-cover"
          controls
          playsInline
          preload="metadata"
          aria-label={`${title} video`}
        />
      ) : (
        <Image
          key={asset.id}
          src={asset.url}
          fill
          unoptimized
          sizes="(max-width: 768px) 100vw, 33vw"
          className="object-cover"
          alt={`${title}, image ${index + 1} of ${assets.length}`}
        />
      )}
      {assets.length > 1 && (
        <div
          className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-2"
          aria-label="Post images"
        >
          <Button
            variant="outline"
            size="icon-sm"
            type="button"
            aria-label="Previous image"
            onClick={() =>
              setSelected((index - 1 + assets.length) % assets.length)
            }
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Badge variant="secondary" aria-live="polite">
            <Images aria-hidden="true" />
            {index + 1} / {assets.length}
          </Badge>
          <Button
            variant="outline"
            size="icon-sm"
            type="button"
            aria-label="Next image"
            onClick={() => setSelected((index + 1) % assets.length)}
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>
  );
}
