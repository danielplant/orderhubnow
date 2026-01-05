"use client";

import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { STOCK_THRESHOLDS } from "@/lib/constants/inventory";
import { Button, Popover, PopoverTrigger, PopoverContent, Text } from "@/components/ui";

interface SizeChipProps {
  size: string;
  available: number;
  /** OnRoute quantity - units in transit to warehouse */
  onRoute: number;
  /** Max orderable = max(available, onRoute) for ATS, or 9999 for PreOrder */
  maxOrderable: number;
  orderedQty: number;
  onTap: () => void;
  onQuantityChange: (delta: number) => void;
}

/**
 * Get stock status considering both available and onRoute.
 * .NET: Uses max(available, onRoute) for determining stock level
 */
function getStockStatusWithOnRoute(available: number, onRoute: number): 'out' | 'low' | 'ok' {
  const maxQty = Math.max(available, onRoute);
  if (maxQty === 0) return 'out';
  if (maxQty <= STOCK_THRESHOLDS.LOW) return 'low';
  return 'ok';
}

export function SizeChip({
  size,
  available,
  onRoute,
  maxOrderable,
  orderedQty,
  onTap,
  onQuantityChange,
}: SizeChipProps) {
  const status = getStockStatusWithOnRoute(available, onRoute);
  // Size is now pre-extracted on the server (matches .NET grouping logic)
  const sizeLabel = size || "OS";
  const hasOnRoute = onRoute > 0;

  return (
    <div className="relative shrink-0">
      {/* Low stock indicator dot */}
      {status === 'low' && (
        <span className="absolute -top-1 -left-1 w-2 h-2 rounded-full bg-amber-400 z-10" />
      )}

      {/* Size Button - adds to order on tap */}
      <motion.button
        onClick={status !== 'out' ? onTap : undefined}
        disabled={status === 'out'}
        aria-label={`Size ${sizeLabel}, ${available} available${hasOnRoute ? `, ${onRoute} on route` : ""}${orderedQty > 0 ? `, ${orderedQty} in order` : ""}${status === 'out' ? ', out of stock' : ''}`}
        className={cn(
          "min-w-[var(--size-chip-min)] h-16 px-3 rounded-lg flex flex-col items-center justify-center gap-0.5",
          "ring-1 ring-inset ring-border motion-fast transition-all",
          status === 'out'
            ? "opacity-40 cursor-not-allowed bg-muted text-muted-foreground"
            : "cursor-pointer bg-card text-foreground hover:ring-2 hover:ring-muted-foreground/30 active:scale-95",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        )}
        whileTap={status !== 'out' ? { scale: 0.95 } : undefined}
      >
        <span className="text-sm font-semibold">{sizeLabel}</span>
        <Text variant="caption" className="opacity-60">{available}</Text>
        {/* OnRoute indicator - matches .NET separate row display */}
        {hasOnRoute && (
          <Text variant="caption" className="opacity-50 text-[10px]">
            ⟳{onRoute}
          </Text>
        )}
      </motion.button>

      {/* Order Badge with Radix Popover for quantity adjustment */}
      {/* Outer button is 44px (WCAG touch target), inner span is 28px (visual) */}
      <AnimatePresence>
        {orderedQty > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <motion.button
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                aria-label={`${orderedQty} ordered, click to adjust quantity`}
                className="absolute -top-3 -right-3 w-11 h-11 flex items-center justify-center cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-full"
              >
                <span className="w-7 h-7 bg-badge-bg text-badge-fg text-[11px] font-bold rounded-full flex items-center justify-center elevation-sm hover:opacity-90">
                  {orderedQty}
                </span>
              </motion.button>
            </PopoverTrigger>
            <PopoverContent 
              className="w-auto p-3" 
              side="top" 
              align="center"
              sideOffset={8}
            >
              {/* Quantity info and stepper - matches .NET display */}
              <div className="flex flex-col gap-2">
                {/* Stock info */}
                <div className="flex gap-3 text-xs text-muted-foreground">
                  <span>Avail: <span className="font-medium text-foreground">{available}</span></span>
                  {hasOnRoute && (
                    <span>Route: <span className="font-medium text-foreground">{onRoute}</span></span>
                  )}
                </div>
                
                {/* Stepper */}
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon-sm"
                    onClick={() => onQuantityChange(-1)}
                    aria-label="Decrease quantity"
                  >
                    −
                  </Button>
                  <span className="w-8 text-center text-sm font-semibold tabular-nums">
                    {orderedQty}
                  </span>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    onClick={() => onQuantityChange(1)}
                    disabled={orderedQty >= maxOrderable}
                    aria-label={orderedQty >= maxOrderable ? "Maximum orderable reached" : "Increase quantity"}
                    title={orderedQty >= maxOrderable ? `Max: ${maxOrderable}` : undefined}
                    className={cn(orderedQty >= maxOrderable && "opacity-40 cursor-not-allowed")}
                  >
                    +
                  </Button>
                </div>
                
                {/* Max info */}
                <div className="text-[10px] text-muted-foreground text-center">
                  Max: {maxOrderable}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        )}
      </AnimatePresence>
    </div>
  );
}
