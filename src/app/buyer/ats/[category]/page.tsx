import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BrandHeader } from "@/components/buyer/brand-header";
import { CollectionProductsGrid } from "@/components/buyer/collection-products-grid";
import { Divider } from "@/components/ui";
import { getSkusByCollection, getCollectionName } from "@/lib/data/queries/collections";
import { buildRepQueryStringFromObject } from "@/lib/utils/rep-context";

interface PageProps {
  params: Promise<{ category: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export const dynamic = 'force-dynamic';

export default async function CollectionPage({ params, searchParams }: PageProps) {
  const [{ category }, queryParams] = await Promise.all([params, searchParams]);
  const collectionId = parseInt(category, 10);

  // Build rep context query string to preserve through navigation
  const repQuery = buildRepQueryStringFromObject(queryParams);

  // Fetch collection name and products in parallel
  const [collectionName, products] = await Promise.all([
    getCollectionName(collectionId),
    getSkusByCollection(collectionId)
  ]);

  const displayName = collectionName ?? `Collection ${collectionId}`;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <BrandHeader />

      <main className="px-6 py-8 md:px-12 lg:px-16 max-w-[1800px] mx-auto">
        {/* Header */}
        <div className="mb-8 space-y-4">
          <Link
            href={`/buyer/ats${repQuery}`}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Collections
          </Link>

          <h1 className="text-3xl md:text-4xl font-medium tracking-tight text-foreground">
            {displayName}
          </h1>

          <Divider size="md" strong />
        </div>

        {/* Filter Bar + Products Grid */}
        {products.length > 0 ? (
          <CollectionProductsGrid products={products} />
        ) : (
          <div className="text-center py-16">
            <p className="text-muted-foreground">No products available in this collection.</p>
          </div>
        )}
      </main>
    </div>
  );
}
