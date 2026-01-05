import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Calendar } from "lucide-react";
import { BrandHeader } from "@/components/buyer/brand-header";
import { Divider } from "@/components/ui";
import { PreOrderProductGrid } from "@/components/buyer/preorder-product-grid";
import {
  getPreOrderCategoryById,
  getPreOrderProductsWithVariants,
} from "@/lib/data/queries/preorder";

interface Props {
  params: Promise<{ collection: string }>;
}

/**
 * Format ship window dates for display.
 */
function formatShipWindow(start: string | null, end: string | null): string {
  if (!start && !end) return "Ship date TBD";

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
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

export default async function PreOrderCollectionPage({ params }: Props) {
  const { collection } = await params;
  const categoryId = parseInt(collection, 10);

  if (Number.isNaN(categoryId)) {
    notFound();
  }

  // Fetch category and products in parallel
  const [category, products] = await Promise.all([
    getPreOrderCategoryById(categoryId),
    getPreOrderProductsWithVariants(categoryId),
  ]);

  // Validate category exists and is a pre-order category
  if (!category) {
    notFound();
  }

  const shipWindow = formatShipWindow(
    category.onRouteStartDate,
    category.onRouteEndDate
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <BrandHeader />

      <main className="px-6 py-8 md:px-12 lg:px-16 max-w-[1800px] mx-auto">
        {/* Header */}
        <div className="mb-8 space-y-4">
          <Link
            href="/buyer/pre-order"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Pre-Order Collections
          </Link>

          <div className="flex flex-col md:flex-row md:items-baseline justify-between gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-medium tracking-tight text-foreground">
                {category.name}
              </h1>
              <div className="flex items-center gap-2 mt-2 text-primary">
                <Calendar className="h-5 w-5" />
                <span className="text-lg font-medium">Ships: {shipWindow}</span>
              </div>
            </div>
            <span className="text-sm font-mono text-muted-foreground">
              {products.length} Products
            </span>
          </div>

          <p className="text-base text-muted-foreground max-w-2xl">
            Pre-order items from this collection. Orders will ship during the
            window shown above.
          </p>

          <Divider size="md" strong />
        </div>

        {/* Product Grid */}
        {products.length > 0 ? (
          <PreOrderProductGrid
            products={products}
            categoryId={category.id}
            categoryName={category.name}
            shipWindowStart={category.onRouteStartDate}
            shipWindowEnd={category.onRouteEndDate}
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
