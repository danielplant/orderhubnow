"use client";

import { useCallback, useMemo } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import type { Product, ProductVariant, Currency } from "@/lib/types";
import { cn, formatPrice } from "@/lib/utils";
import { STOCK_THRESHOLDS } from "@/lib/constants/inventory";
import { FEATURES } from "@/lib/constants/features";
import { ColorSwatch, Text } from "@/components/ui";
import { SizeChip } from "./size-chip";
import { useOrder, useAnnouncement, useCurrency } from "@/lib/contexts";

function getPrice(item: { priceCad: number; priceUsd: number }, currency: Currency): number {
  return currency === "CAD" ? item.priceCad : item.priceUsd;
}

interface ProductOrderCardProps {
  product: Product;
}

export function ProductOrderCard({ product }: ProductOrderCardProps) {
  const { orders, addItem, setQuantity, getProductTotal } = useOrder();
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

  const handleChipTap = useCallback(
    (variant: ProductVariant) => {
      if (variant.available === 0) return;

      const currentQty = productOrders[variant.sku] || 0;
      if (currentQty >= variant.available) return;

      const variantPrice = getPrice(variant, currency);
      addItem(product.id, variant.sku, 1, variantPrice);

      // Announce change for screen readers
      const newTotal = totalItems + 1;
      const newPrice = totalPrice + variantPrice;
      announce(`${product.title}: ${newTotal} ${newTotal === 1 ? "unit" : "units"}, ${formatPrice(newPrice)}`);
    },
    [product, productOrders, totalItems, totalPrice, addItem, announce, currency]
  );

  const handleQuantityChange = useCallback(
    (variant: ProductVariant, delta: number) => {
      const currentQty = productOrders[variant.sku] || 0;
      const newQty = Math.max(0, Math.min(currentQty + delta, variant.available));

      const variantPrice = getPrice(variant, currency);
      setQuantity(product.id, variant.sku, newQty, variantPrice);

      // Announce change for screen readers
      const qtyDiff = newQty - currentQty;
      const newTotal = totalItems + qtyDiff;
      const newPrice = totalPrice + qtyDiff * variantPrice;
      announce(`${product.title}: ${newTotal} ${newTotal === 1 ? "unit" : "units"}, ${formatPrice(newPrice)}`);
    },
    [product, productOrders, totalItems, totalPrice, setQuantity, announce, currency]
  );

  const availableVariants = product.variants.filter((v) => v.available > 0);
  
  // Card-level low stock indicator: true if ANY variant has 1-6 units
  const hasLowStock = availableVariants.some(
    (v) => v.available > 0 && v.available <= STOCK_THRESHOLDS.LOW
  );

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
          <span className="text-lg font-bold text-foreground">
            {formatPrice(price)}
          </span>
        </div>

        <h3 className="text-sm font-semibold text-foreground tracking-tight leading-snug">
          {product.title || product.skuBase}
        </h3>

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
      <div className="relative flex-1 min-h-0 bg-secondary overflow-hidden group">
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.title}
            fill
            className="object-contain p-2 motion-slow transition-transform group-hover:scale-105"
            sizes="(max-width: 768px) 100vw, 33vw"
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

      {/* Size Chips */}
      <div className="h-20 border-t border-border shrink-0">
        <div className="h-full px-3 py-2 flex items-center gap-2 overflow-x-auto scrollbar-none">
          {availableVariants.length === 0 ? (
            <span className="text-sm text-muted-foreground italic">
              No sizes available
            </span>
          ) : (
            availableVariants.map((variant) => {
              const orderedQty = productOrders[variant.sku] || 0;

              return (
                <SizeChip
                  key={variant.sku}
                  size={variant.size}
                  available={variant.available}
                  orderedQty={orderedQty}
                  onTap={() => handleChipTap(variant)}
                  onQuantityChange={(delta) => handleQuantityChange(variant, delta)}
                />
              );
            })
          )}
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
