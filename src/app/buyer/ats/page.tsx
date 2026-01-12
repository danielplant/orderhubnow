import { BrandHeader } from "@/components/buyer/brand-header";
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
    <div className="min-h-screen bg-background text-foreground">
      <BrandHeader />

      <main className="px-6 py-8 md:px-12 lg:px-16 max-w-[1800px] mx-auto">
        {/* Header */}
        <div className="mb-10 space-y-4">
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
