"use client";

import { useCallback, useMemo, useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import type { Product, ProductVariant, Currency } from "@/lib/types";
import { cn, formatPrice } from "@/lib/utils";
import { STOCK_THRESHOLDS } from "@/lib/constants/inventory";
import { FEATURES } from "@/lib/constants/features";
import { ColorSwatch, FabricSwatch, Text } from "@/components/ui";
import { useOrder, useAnnouncement, useCurrency } from "@/lib/contexts";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

function getPrice(item: { priceCad: number; priceUsd: number }, currency: Currency): number {
  return currency === "CAD" ? item.priceCad : item.priceUsd;
}

/** Product image with error fallback and lightbox on click */
function ProductImage({ imageUrl, title }: { imageUrl?: string; title: string }) {
  const [hasError, setHasError] = useState(false);

  const showPlaceholder = !imageUrl || hasError;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <div className="relative flex-1 min-h-0 bg-secondary overflow-hidden group cursor-zoom-in">
          {!showPlaceholder ? (
            <Image
              src={imageUrl}
              alt={title}
              fill
              className="object-contain p-2 motion-slow transition-transform group-hover:scale-105"
              sizes="(max-width: 768px) 100vw, 33vw"
              onError={() => setHasError(true)}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/40">
              <svg
                className="w-16 h-16"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </div>
          )}
        </div>
      </DialogTrigger>

      {/* Lightbox Modal */}
      <DialogContent className="max-w-3xl p-0 overflow-hidden">
        <div className="relative aspect-square w-full bg-secondary">
          {!showPlaceholder ? (
            <Image
              src={imageUrl}
              alt={title}
              fill
              className="object-contain"
              sizes="(max-width: 1024px) 100vw, 768px"
              priority
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/40">
              <span>No image available</span>
            </div>
          )}
        </div>
        <div className="p-4 bg-background border-t">
          <p className="text-sm font-medium text-center">{title}</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface ProductOrderCardProps {
  product: Product;
  /** PreOrder mode: no qty caps, all lines marked as OnRoute */
  isPreOrder?: boolean;
}

/**
 * Get max orderable quantity for a variant.
 * .NET: ATS caps at available quantity, PreOrder has no cap
 */
function getMaxOrderable(variant: ProductVariant, isPreOrder: boolean): number {
  if (isPreOrder) {
    return 9999; // No cap for PreOrder per .NET behavior
  }
  return variant.available;
}

/**
 * Check if a variant is orderable (should be shown).
 * .NET: Show if available > 0 OR onRoute > 0
 */
function isVariantOrderable(variant: ProductVariant): boolean {
  return variant.available > 0 || variant.onRoute > 0;
}

/**
 * Determine if an order line should be marked as OnRoute.
 * .NET: PreOrder lines are OnRoute, ATS lines are not
 */
function getIsOnRoute(variant: ProductVariant, isPreOrder: boolean): boolean {
  if (isPreOrder) {
    return true; // All PreOrder lines are OnRoute
  }
  return false;
}

export function ProductOrderCard({ product, isPreOrder = false }: ProductOrderCardProps) {
  const { orders, setQuantity, getProductTotal } = useOrder();
  const { announce } = useAnnouncement();
  const { currency } = useCurrency();

  const productOrders = useMemo(
    () => orders[product.id] || {},
    [orders, product.id]
  );
  const { items: totalItems, price: totalPrice } = getProductTotal(product, currency);

  // Get prices based on selected currency
  const price = getPrice(product, currency);
  const msrp = currency === "CAD" ? product.msrpCad : product.msrpUsd;

  // Filter: For ATS, show variants where available > 0 OR onRoute > 0 (.NET parity)
  // For PreOrder, show ALL variants - buyers order for future delivery regardless of current inventory
  const orderableVariants = isPreOrder
    ? product.variants
    : product.variants.filter(isVariantOrderable);

  const [draftBySku, setDraftBySku] = useState<Record<string, string>>({});
  const [qtyError, setQtyError] = useState<string | null>(null);

  const commitQuantity = useCallback(
    (variant: ProductVariant) => {
      const raw = draftBySku[variant.sku] ?? "";
      const parsed = raw.trim() === "" ? 0 : parseInt(raw, 10);
      const requestedQty = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;

      const maxOrderable = getMaxOrderable(variant, isPreOrder);
      const currentQty = productOrders[variant.sku] || 0;
      const committedQty = Math.min(requestedQty, maxOrderable);

      if (requestedQty > maxOrderable) {
        setQtyError("Order quantity cannot be greater than Available quantity.");
        window.setTimeout(() => setQtyError(null), 3000);
      }

      const variantPrice = getPrice(variant, currency);
      const isOnRoute = getIsOnRoute(variant, isPreOrder);
      setQuantity(product.id, variant.sku, committedQty, variantPrice, { isOnRoute });
      setDraftBySku((prev) => ({
        ...prev,
        [variant.sku]: committedQty > 0 ? String(committedQty) : "",
      }));

      const qtyDiff = committedQty - currentQty;
      if (qtyDiff !== 0) {
        const newTotal = totalItems + qtyDiff;
        const newPrice = totalPrice + qtyDiff * variantPrice;
        announce(
          `${product.title}: ${newTotal} ${newTotal === 1 ? "unit" : "units"}, ${formatPrice(newPrice)}`
        );
      }
    },
    [
      announce,
      currency,
      draftBySku,
      isPreOrder,
      product.id,
      product.title,
      productOrders,
      setQuantity,
      totalItems,
      totalPrice,
    ]
  );
  
  // Card-level low stock indicator: considers max(available, onRoute) per .NET
  const hasLowStock = orderableVariants.some((v) => {
    const maxQty = Math.max(v.available, v.onRoute);
    return maxQty > 0 && maxQty <= STOCK_THRESHOLDS.LOW;
  });

  return (
    <motion.div
      data-product-card
      data-product-id={product.id}
      className="h-[var(--size-product-card-mobile)] sm:h-[var(--size-product-card-tablet)] lg:h-[var(--size-product-card)] flex flex-col rounded-xl bg-card elevation-md hover:elevation-lg motion-normal transition-shadow overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      whileHover={{ scale: 1.005 }}
      transition={{ duration: 0.2 }}
      tabIndex={0}
    >
      {/* Header */}
      <div className={cn(
        "px-4 pt-4 pb-3 border-b shrink-0",
        hasLowStock ? "border-amber-300" : "border-border"
      )}>
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {product.skuBase}
            </span>
            {product.color && <ColorSwatch color={product.color} />}
            {product.fabric && <FabricSwatch fabric={product.fabric} />}
            {hasLowStock && (
              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                <span className="text-[10px] font-medium text-amber-700">Low Stock</span>
              </div>
            )}
            {FEATURES.SHOW_POPULARITY && product.popularityRank && product.popularityRank <= 10 && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700">
                Best Seller
              </span>
            )}
          </div>
          <span className="text-sm font-bold text-foreground">
            {formatPrice(price)}
          </span>
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <h3 className="text-xs font-medium text-foreground tracking-tight truncate cursor-default">
              {product.title || product.skuBase}
            </h3>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-[250px]">
            {product.title || product.skuBase}
          </TooltipContent>
        </Tooltip>

        <div className="flex items-center justify-between mt-1">
          <span className="text-xs text-muted-foreground">
            {product.fabric || "\u00A0"}
          </span>
          <div className="flex items-center gap-2">
            {msrp > 0 && (
              <Text variant="caption" color="secondary">
                MSRP {formatPrice(msrp)}
              </Text>
            )}
            {FEATURES.SHOW_MARGIN && msrp > 0 && msrp > price && (
              <span className="text-[10px] text-success font-medium tabular-nums">
                {Math.round(((msrp - price) / msrp) * 100)}% · {formatPrice(msrp - price)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Product Image */}
      <ProductImage imageUrl={product.imageUrl} title={product.title} />

      {/* Size Grid (direct order entry) */}
      <div className="border-t border-border shrink-0">
        <div className="px-3 py-2 overflow-x-auto scrollbar-none">
          {orderableVariants.length === 0 ? (
            <span className="text-sm text-muted-foreground italic">No sizes available</span>
          ) : (
            <div
              className="grid w-max rounded-md overflow-hidden border border-border bg-background"
              style={{
                gridTemplateColumns: `6rem repeat(${orderableVariants.length}, var(--size-chip-min))`,
              }}
            >
              <div className="bg-muted px-2 py-2 text-xs font-semibold border-b border-border">
                Size
              </div>
              {orderableVariants.map((variant) => (
                <div
                  key={`size-${variant.sku}`}
                  className="px-2 py-2 text-xs font-semibold text-center border-b border-border truncate"
                  title={variant.size || "OS"}
                >
                  {variant.size || "OS"}
                </div>
              ))}

              <div className="bg-muted px-2 py-2 text-xs font-semibold border-b border-border">
                Available
              </div>
              {orderableVariants.map((variant) => (
                <div
                  key={`avail-${variant.sku}`}
                  className="px-2 py-2 text-xs text-center tabular-nums border-b border-border"
                >
                  {isPreOrder ? (variant.available > 0 ? variant.available : '') : variant.available}
                </div>
              ))}

              {isPreOrder && (
                <>
                  <div className="bg-muted px-2 py-2 text-xs font-semibold border-b border-border">
                    On Route
                  </div>
                  {orderableVariants.map((variant) => (
                    <div
                      key={`route-${variant.sku}`}
                      className="px-2 py-2 text-xs text-center tabular-nums border-b border-border"
                    >
                      {variant.onRoute > 0 ? variant.onRoute : ""}
                    </div>
                  ))}
                </>
              )}

              <div className="bg-muted px-2 py-1.5 text-xs font-semibold">Order</div>
              {orderableVariants.map((variant) => {
                const maxOrderable = getMaxOrderable(variant, isPreOrder);
                const orderedQty = productOrders[variant.sku] || 0;
                return (
                  <div key={`order-${variant.sku}`} className="px-2 py-1.5">
                    <input
                      inputMode="numeric"
                      pattern="[0-9]*"
                      className={cn(
                        "w-full h-7 rounded-sm border border-input bg-background text-center text-xs tabular-nums",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      )}
                      aria-label={`Order quantity for size ${variant.size || "OS"}`}
                      value={draftBySku[variant.sku] ?? (orderedQty > 0 ? String(orderedQty) : "")}
                      onFocus={() => {
                        setDraftBySku((prev) => {
                          if (prev[variant.sku] !== undefined) return prev;
                          return {
                            ...prev,
                            [variant.sku]: orderedQty > 0 ? String(orderedQty) : "",
                          };
                        });
                      }}
                      onChange={(e) => {
                        const digitsOnly = e.target.value.replace(/[^\d]/g, "");
                        setDraftBySku((prev) => ({ ...prev, [variant.sku]: digitsOnly }));
                        
                        // Update cart total immediately for reactive UI feedback
                        const parsed = digitsOnly === "" ? 0 : parseInt(digitsOnly, 10);
                        const requestedQty = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
                        const maxOrderable = getMaxOrderable(variant, isPreOrder);
                        const committedQty = Math.min(requestedQty, maxOrderable);
                        const variantPrice = getPrice(variant, currency);
                        const isOnRoute = getIsOnRoute(variant, isPreOrder);
                        setQuantity(product.id, variant.sku, committedQty, variantPrice, { isOnRoute });
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.currentTarget.blur();
                        }
                      }}
                      onBlur={() => commitQuantity(variant)}
                      disabled={maxOrderable === 0}
                    />
                  </div>
                );
              })}
            </div>
          )}

          {qtyError ? (
            <div className="mt-2 text-xs text-destructive">{qtyError}</div>
          ) : null}
        </div>
      </div>

      {/* Footer */}
      <div className="h-11 px-4 flex items-center justify-between border-t border-border bg-secondary shrink-0">
        <motion.span
          key={`items-${totalItems}`}
          initial={{ scale: 1.1 }}
          animate={{ scale: 1 }}
          className={cn(
            "text-sm font-medium",
            totalItems > 0 ? "text-foreground" : "text-muted-foreground"
          )}
        >
          {totalItems} {totalItems === 1 ? "unit" : "units"}
        </motion.span>
        <motion.span
          key={`price-${totalPrice}`}
          initial={{ scale: 1.1 }}
          animate={{ scale: 1 }}
          className={cn(
            "text-base font-bold",
            totalPrice > 0 ? "text-foreground" : "text-muted-foreground"
          )}
        >
          {formatPrice(totalPrice)}
        </motion.span>
      </div>
    </motion.div>
  );
}
