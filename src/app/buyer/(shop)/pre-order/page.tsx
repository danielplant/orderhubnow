import Link from "next/link";
import { ArrowLeft, ArrowRight, Calendar } from "lucide-react";
import { Divider } from "@/components/ui";
import { getPreOrderCollectionsForBuyer } from "@/lib/data/queries/collections";
import { cn, getCategoryGradient } from "@/lib/utils";
import { buildRepQueryStringFromObject } from "@/lib/utils/rep-context";

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/**
 * Format ship window dates for display.
 * Matches .NET OnRouteAvailableDate display logic.
 */
function formatShipWindow(start: string | null, end: string | null): string {
  if (!start && !end) return "Ship date TBD";

  const formatDate = (dateStr: string) => {
    // Extract date-only part and force local midnight (avoids UTC timezone shift)
    const dateOnly = dateStr.split('T')[0]
    const date = new Date(dateOnly + 'T00:00:00');
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  if (start && end) {
    return `${formatDate(start)} - ${formatDate(end)}`;
  }
  return formatDate(start || end!);
}

/**
 * Pre-Order Collection Card with ship window display.
 */
function PreOrderCollectionCard({
  name,
  count,
  href,
  imageUrl,
  shipWindowStart,
  shipWindowEnd,
}: {
  name: string;
  count: number;
  href: string;
  imageUrl?: string | null;
  shipWindowStart: string | null;
  shipWindowEnd: string | null;
}) {
  const shipWindow = formatShipWindow(shipWindowStart, shipWindowEnd);

  return (
    <Link href={href} className="group block cursor-pointer">
      {/* Gradient Placeholder */}
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

      {/* Title and Details */}
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

        {/* Ship Window Badge */}
        <div className="flex items-center gap-2 text-sm text-primary">
          <Calendar className="h-4 w-4" />
          <span className="font-medium">Ships: {shipWindow}</span>
        </div>
      </div>
    </Link>
  );
}

export default async function PreOrderPage({ searchParams }: Props) {
  const [collections, params] = await Promise.all([
    getPreOrderCollectionsForBuyer(),
    searchParams,
  ]);

  // Build rep context query string to preserve through navigation
  const repQuery = buildRepQueryStringFromObject(params);

  return (
    <div className="bg-background text-foreground">
      <main className="px-6 py-8 md:px-12 lg:px-16 max-w-[1800px] mx-auto">
        {/* Header */}
        <div className="mb-10 space-y-4">
          <Link
            href={`/buyer/select-journey${repQuery}`}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Order Portal
          </Link>
          <div className="flex items-baseline justify-between gap-4">
            <h1 className="text-3xl md:text-4xl font-medium tracking-tight text-foreground">
              Pre-Order Collections
            </h1>
            <span className="text-sm font-mono text-muted-foreground">
              {collections.length} Collections
            </span>
          </div>
          <p className="text-base text-muted-foreground max-w-2xl">
            Browse upcoming inventory available for pre-order. Ship dates shown
            are estimated availability windows.
          </p>
          <Divider size="md" strong />
        </div>

        {/* Collections Grid */}
        {collections.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
            {collections.map((collection) => (
              <PreOrderCollectionCard
                key={collection.id}
                name={collection.name}
                count={collection.productCount}
                href={`/buyer/pre-order/${collection.id}${repQuery}`}
                imageUrl={collection.imageUrl}
                shipWindowStart={collection.onRouteStartDate}
                shipWindowEnd={collection.onRouteEndDate}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <p className="text-muted-foreground">
              No pre-order collections available at this time.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
