import { BrandHeader } from "@/components/buyer/brand-header";
import { CollectionCard } from "@/components/buyer/collection-card";
import { Divider } from "@/components/ui";
import { getCategoriesWithProductCount } from "@/lib/data/queries/categories";
import { buildRepQueryStringFromObject } from "@/lib/utils/rep-context";

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function ATSPage({ searchParams }: Props) {
  const [categories, params] = await Promise.all([
    getCategoriesWithProductCount(),
    searchParams,
  ]);
  
  // Build rep context query string to preserve through navigation
  const repQuery = buildRepQueryStringFromObject(params);
  
  // Filter to ATS categories (not pre-order) and with products
  const atsCategories = categories.filter(cat => !cat.isPreOrder);

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
              {atsCategories.length} Collections
            </span>
          </div>
          <p className="text-base text-muted-foreground max-w-2xl">
            Browse current inventory available for immediate shipment. Select a collection to view products and place orders.
          </p>
          <Divider size="md" strong />
        </div>

        {/* Collections Grid */}
        {atsCategories.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
            {atsCategories.map((category) => (
              <CollectionCard
                key={category.id}
                name={category.name}
                count={category.productCount}
                href={`/buyer/ats/${category.id}${repQuery}`}
                imageUrl={`/SkuImages/${category.id}.jpg`}
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
