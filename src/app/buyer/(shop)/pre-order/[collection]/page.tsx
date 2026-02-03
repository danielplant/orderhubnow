import { notFound } from "next/navigation";
import { Calendar } from "lucide-react";
import { Breadcrumb, Divider } from "@/components/ui";
import { CollectionProductsGrid } from "@/components/buyer/collection-products-grid";
import {
  getPreOrderCollectionById,
  getPreOrderProductsByCollection,
} from "@/lib/data/queries/collections";
import { getAvailabilitySettings } from "@/lib/data/queries/availability-settings";
import { buildRepQueryStringFromObject } from "@/lib/utils/rep-context";

interface Props {
  params: Promise<{ collection: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Format ship window dates for display.
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

export const dynamic = "force-dynamic";

export default async function PreOrderCollectionPage({ params, searchParams }: Props) {
  const [{ collection: collectionParam }, queryParams] = await Promise.all([params, searchParams]);
  const collectionId = parseInt(collectionParam, 10);

  if (Number.isNaN(collectionId)) {
    notFound();
  }

  // Build rep context query string to preserve through navigation
  const repQuery = buildRepQueryStringFromObject(queryParams);

  // Fetch collection and products in parallel
  const [collection, products, availabilitySettings] = await Promise.all([
    getPreOrderCollectionById(collectionId),
    getPreOrderProductsByCollection(collectionId),
    getAvailabilitySettings(),
  ]);

  // Validate collection exists and is a pre-order collection
  if (!collection) {
    notFound();
  }

  const shipWindow = formatShipWindow(
    collection.onRouteStartDate,
    collection.onRouteEndDate
  );
  const availableLabel = availabilitySettings.matrix.preorder_incoming.buyer_preorder.label;

  return (
    <div className="bg-background text-foreground">
      <main className="px-6 py-8 md:px-12 lg:px-16 max-w-[1800px] mx-auto">
        {/* Header */}
        <div className="mb-8 space-y-4">
          <Breadcrumb items={[
            { label: 'Order Portal', href: `/buyer/select-journey${repQuery}` },
            { label: 'Pre-Order', href: `/buyer/pre-order${repQuery}` },
            { label: collection.name },
          ]} />

          <div>
            <h1 className="text-3xl md:text-4xl font-medium tracking-tight text-foreground">
              {collection.name}
            </h1>
            <div className="flex items-center gap-2 mt-2 text-primary">
              <Calendar className="h-5 w-5" />
              <span className="text-lg font-medium">Ships: {shipWindow}</span>
            </div>
          </div>

          <p className="text-base text-muted-foreground max-w-2xl">
            Pre-order items from this collection. Orders will ship during the
            window shown above.
          </p>

          <Divider size="md" strong />
        </div>

        {/* Filter Bar + Product Grid */}
        {products.length > 0 ? (
          <CollectionProductsGrid
            products={products}
            isPreOrder
            availableLabel={availableLabel}
          />
        ) : (
          <div className="text-center py-16">
            <p className="text-muted-foreground">
              No products available in this collection.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
