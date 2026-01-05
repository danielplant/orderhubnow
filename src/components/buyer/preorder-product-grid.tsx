"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useOrder } from "@/lib/contexts/order-context";
import { useCurrency } from "@/lib/contexts/currency-context";
import { formatCurrency } from "@/lib/utils";
import type { PreOrderProduct, PreOrderProductVariant } from "@/lib/data/queries/preorder";

interface PreOrderProductGridProps {
  products: PreOrderProduct[];
  categoryId: number;
  categoryName: string;
  shipWindowStart: string | null;
  shipWindowEnd: string | null;
}

/**
 * Pre-Order Product Grid Component
 * 
 * Displays products with Size, Available, On Route, Order qty, and Price columns.
 * No quantity caps per .NET behavior - OnRoute shown as informational only.
 */
export function PreOrderProductGrid({
  products,
  categoryId,
  categoryName,
  shipWindowStart,
  shipWindowEnd,
}: PreOrderProductGridProps) {
  const { currency } = useCurrency();
  const { addItem, orders } = useOrder();

  // Local state for quantity inputs (keyed by SKU)
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const handleQuantityChange = useCallback((sku: string, value: string) => {
    const qty = parseInt(value, 10);
    setQuantities((prev) => ({
      ...prev,
      [sku]: isNaN(qty) ? 0 : Math.max(0, Math.min(9999, qty)),
    }));
  }, []);

  const handleAddToOrder = useCallback(
    (variant: PreOrderProductVariant, productId: string) => {
      const qty = quantities[variant.sku] || 0;
      if (qty <= 0) return;

      const price = currency === "CAD" ? variant.priceCad : variant.priceUsd;

      // Add to order with pre-order metadata
      addItem(productId, variant.sku, qty, price, {
        categoryId,
        categoryName,
        onRouteStart: shipWindowStart,
        onRouteEnd: shipWindowEnd,
      });

      // Clear the input
      setQuantities((prev) => ({ ...prev, [variant.sku]: 0 }));
    },
    [quantities, currency, addItem, categoryId, categoryName, shipWindowStart, shipWindowEnd]
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          currency={currency}
          quantities={quantities}
          orders={orders}
          onQuantityChange={handleQuantityChange}
          onAddToOrder={handleAddToOrder}
        />
      ))}
    </div>
  );
}

interface ProductCardProps {
  product: PreOrderProduct;
  currency: "USD" | "CAD";
  quantities: Record<string, number>;
  orders: Record<string, Record<string, number>>;
  onQuantityChange: (sku: string, value: string) => void;
  onAddToOrder: (variant: PreOrderProductVariant, productId: string) => void;
}

function ProductCard({
  product,
  currency,
  quantities,
  orders,
  onQuantityChange,
  onAddToOrder,
}: ProductCardProps) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        {/* Product Header */}
        <div className="flex gap-4 p-4 border-b">
          {product.imageUrl && (
            <div className="relative w-24 h-32 flex-shrink-0 bg-secondary rounded overflow-hidden">
              <Image
                src={product.imageUrl}
                alt={product.baseSku}
                fill
                className="object-cover"
                sizes="96px"
              />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-lg">{product.baseSku}</h3>
            <p className="text-sm text-muted-foreground line-clamp-2">
              {product.description}
            </p>
            {product.color && (
              <p className="text-sm mt-1">
                <span className="font-medium">Color:</span> {product.color}
              </p>
            )}
            {product.fabricContent && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                {product.fabricContent}
              </p>
            )}
          </div>
        </div>

        {/* Size/Quantity Grid */}
        <div className="p-4">
          {/* Header Row */}
          <div className="grid grid-cols-6 gap-2 text-xs font-medium text-muted-foreground mb-2 px-1">
            <div>Size</div>
            <div className="text-center">Avail</div>
            <div className="text-center text-primary">On Route</div>
            <div className="text-center col-span-2">Order</div>
            <div className="text-right">Price</div>
          </div>

          {/* Variant Rows */}
          <div className="space-y-1">
            {product.variants.map((variant) => {
              const price = currency === "CAD" ? variant.priceCad : variant.priceUsd;
              const currentQty = orders[product.id]?.[variant.sku] || 0;
              const inputQty = quantities[variant.sku] || 0;

              return (
                <div
                  key={variant.sku}
                  className="grid grid-cols-6 gap-2 items-center py-2 px-1 border-t text-sm hover:bg-secondary/50 rounded"
                >
                  <div className="font-medium">{variant.size}</div>
                  <div className="text-center text-muted-foreground">
                    {variant.available < 1 ? (
                      <span className="text-muted-foreground/50">0</span>
                    ) : (
                      variant.available
                    )}
                  </div>
                  <div className="text-center text-primary font-medium">
                    {variant.onRoute > 0 ? variant.onRoute : "-"}
                  </div>
                  <div className="col-span-2 flex items-center gap-1">
                    <Input
                      type="number"
                      min={0}
                      max={9999}
                      value={inputQty || ""}
                      onChange={(e) => onQuantityChange(variant.sku, e.target.value)}
                      className="h-8 w-16 text-center text-sm"
                      placeholder="0"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 px-2"
                      disabled={inputQty <= 0}
                      onClick={() => onAddToOrder(variant, product.id)}
                    >
                      +
                    </Button>
                  </div>
                  <div className="text-right">
                    <div>{formatCurrency(price, currency)}</div>
                    {currentQty > 0 && (
                      <div className="text-xs text-primary font-medium">
                        ({currentQty} ordered)
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
