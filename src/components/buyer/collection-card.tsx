'use client'

import { useState, useMemo } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn, getCategoryGradient } from "@/lib/utils";
import { useImageConfigOptional } from "@/lib/contexts";

interface CollectionCardProps {
  name: string;
  count: number;
  href: string;
  /** Optional category image URL (e.g. /SkuImages/{categoryId}.jpg) */
  imageUrl?: string | null;
  /** Optional thumbnail path for S3 cached image */
  thumbnailPath?: string | null;
}

export function CollectionCard({ name, count, href, imageUrl, thumbnailPath }: CollectionCardProps) {
  const [primaryError, setPrimaryError] = useState(false);
  const [fallbackError, setFallbackError] = useState(false);
  const imageConfig = useImageConfigOptional();

  // Get image URLs from config (if provider is available)
  const { primaryUrl, fallbackUrl } = useMemo(() => {
    if (imageConfig) {
      return imageConfig.getImageUrl('buyer_collection_card', thumbnailPath, imageUrl);
    }
    // Fallback to original behavior if no provider
    return { primaryUrl: imageUrl ?? null, fallbackUrl: null };
  }, [imageConfig, thumbnailPath, imageUrl]);

  // Determine what to show
  const showPrimary = primaryUrl && !primaryError;
  const showFallback = !showPrimary && fallbackUrl && !fallbackError;
  const showGradientOnly = !showPrimary && !showFallback;

  return (
    <Link href={href} className="group block cursor-pointer">
      {/* Gradient Placeholder with optional image */}
      <div
        className={cn(
          "relative aspect-[4/3] w-full overflow-hidden rounded-sm bg-gradient-to-br mb-6 transition-transform motion-slow group-hover:scale-[1.02]",
          getCategoryGradient(name)
        )}
      >
        {showPrimary && (
          <img
            src={primaryUrl}
            alt={name}
            className="absolute inset-0 w-full h-full object-cover"
            onError={() => setPrimaryError(true)}
          />
        )}
        {showFallback && (
          <img
            src={fallbackUrl}
            alt={name}
            className="absolute inset-0 w-full h-full object-cover"
            onError={() => setFallbackError(true)}
          />
        )}
        {showGradientOnly && null}
        <div className="w-full h-full opacity-0 group-hover:opacity-10 transition-opacity motion-slow bg-background" />
      </div>

      {/* Title and Count */}
      <div className="flex flex-col space-y-2 border-t border-transparent pt-2">
        <div className="flex items-baseline justify-between">
          <h3 className="text-xl md:text-2xl font-medium text-foreground group-hover:text-muted-foreground transition-colors motion-normal">
            {name}
          </h3>
          <ArrowRight className="h-5 w-5 text-border -rotate-45 group-hover:rotate-0 group-hover:text-foreground transition-all motion-normal" />
        </div>

        <span className="text-sm font-mono text-muted-foreground tracking-wide uppercase">
          {count} Styles Available
        </span>
      </div>
    </Link>
  );
}
