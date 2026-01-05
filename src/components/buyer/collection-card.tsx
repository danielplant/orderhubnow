import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn, getCategoryGradient } from "@/lib/utils";

interface CollectionCardProps {
  name: string;
  count: number;
  href: string;
  /** Optional category image URL (e.g. /SkuImages/{categoryId}.jpg) */
  imageUrl?: string | null;
}

export function CollectionCard({ name, count, href, imageUrl }: CollectionCardProps) {
  return (
    <Link href={href} className="group block cursor-pointer">
      {/* Gradient Placeholder - Future: real collection images */}
      <div
        className={cn(
          "relative aspect-[4/3] w-full overflow-hidden rounded-sm bg-gradient-to-br mb-6 transition-transform motion-slow group-hover:scale-[1.02]",
          getCategoryGradient(name)
        )}
      >
        {imageUrl ? (
          <div
            className="absolute inset-0 bg-center bg-cover"
            style={{ backgroundImage: `url(${imageUrl})` }}
          />
        ) : null}
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
