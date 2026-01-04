import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BrandHeader } from "@/components/buyer/brand-header";
import { ProductOrderCard } from "@/components/buyer/product-order-card";
import { Divider } from "@/components/ui";
import { getSkusByCategory, getCategoryName } from "@/lib/data/queries/skus";

interface PageProps {
  params: Promise<{ category: string }>;
}

export const dynamic = 'force-dynamic';

export default async function CategoryPage({ params }: PageProps) {
  const { category } = await params;
  const categoryId = parseInt(category, 10);
  
  // Fetch category name and products in parallel
  const [categoryName, products] = await Promise.all([
    getCategoryName(categoryId),
    getSkusByCategory(categoryId)
  ]);

  const displayName = categoryName ?? `Category ${categoryId}`;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <BrandHeader />

      <main className="px-6 py-8 md:px-12 lg:px-16 max-w-[1800px] mx-auto">
        {/* Header */}
        <div className="mb-8 space-y-4">
          <Link
            href="/buyer/ats"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Collections
          </Link>

          <div className="flex items-baseline justify-between gap-4">
            <h1 className="text-3xl md:text-4xl font-medium tracking-tight text-foreground">
              {displayName}
            </h1>
            <span className="text-sm font-mono text-muted-foreground">
              {products.length} {products.length === 1 ? "style" : "styles"}
            </span>
          </div>

          <Divider size="md" strong />
        </div>

        {/* Products Grid */}
        {products.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {products.map((product) => (
              <ProductOrderCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <p className="text-muted-foreground">No products available in this collection.</p>
          </div>
        )}
      </main>
    </div>
  );
}
