import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CollectionCard } from "@/components/buyer/collection-card";
import { Divider } from "@/components/ui";
import { getATSCollectionsForBuyer } from "@/lib/data/queries/collections";
import { buildRepQueryStringFromObject } from "@/lib/utils/rep-context";

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function ATSPage({ searchParams }: Props) {
  const [atsCollections, params] = await Promise.all([
    getATSCollectionsForBuyer(),
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
              Available to Ship
            </h1>
            <span className="text-sm font-mono text-muted-foreground">
              {atsCollections.length} Collections
            </span>
          </div>
          <p className="text-base text-muted-foreground max-w-2xl">
            Browse current inventory available for immediate shipment. Select a collection to view products and place orders.
          </p>
          <Divider size="md" strong />
        </div>

        {/* Collections Grid */}
        {atsCollections.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
            {atsCollections.map((collection) => (
              <CollectionCard
                key={collection.id}
                name={collection.name}
                count={collection.productCount}
                href={`/buyer/ats/${collection.id}${repQuery}`}
                imageUrl={collection.imageUrl ?? `/SkuImages/${collection.id}.jpg`}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <p className="text-muted-foreground">No collections available at this time.</p>
          </div>
        )}
      </main>
    </div>
  );
}
