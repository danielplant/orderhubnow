"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Compass, Bell, Search, HelpCircle, ShoppingCart, ChevronDown, Trash2, ExternalLink } from "lucide-react";
import { Button, Divider, IndicatorDot, IconBox, Badge } from "@/components/ui";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { BRAND_NAME, APP_NAME } from "@/lib/constants/brand";
import { CurrencyToggle } from "./currency-toggle";
import { useOrder, useCurrency } from "@/lib/contexts";
import { formatCurrency } from "@/lib/utils";

interface BrandHeaderProps {
  userInitials?: string;
}

export function BrandHeader({ userInitials = "?" }: BrandHeaderProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { totalItems, totalPrice, editOrderId, isEditMode, isValidatingEditState, clearAll, clearEditMode } = useOrder();
  const { currency } = useCurrency();
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // During edit state validation, suppress stale cart data to avoid misleading UI
  // (e.g., showing "36 items | $1,408" when the order no longer exists)
  const displayItems = (isValidatingEditState && isEditMode) ? 0 : totalItems;
  const displayPrice = (isValidatingEditState && isEditMode) ? 0 : totalPrice;

  // Handle clearing the cart (works for both edit mode and regular cart)
  const handleClearCart = () => {
    if (isEditMode) {
      clearEditMode();
    } else {
      clearAll();
    }
    setShowClearConfirm(false);
  };

  // Determine if we're in pre-order flow
  const isPreOrder = pathname.startsWith("/buyer/pre-order");
  
  // Build my-order href preserving rep context and edit order params
  const buildMyOrderHref = () => {
    const params = new URLSearchParams();
    if (isPreOrder) params.set("isPreOrder", "true");

    // Preserve rep context params
    const repId = searchParams.get("repId");
    const returnTo = searchParams.get("returnTo");
    if (repId) params.set("repId", repId);
    if (returnTo) params.set("returnTo", returnTo);

    // Preserve edit order context - use URL param or fall back to context state
    const editOrder = searchParams.get("editOrder");
    if (editOrder) {
      params.set("editOrder", editOrder);
    } else if (isEditMode && editOrderId) {
      params.set("editOrder", editOrderId);
    }

    const qs = params.toString();
    return `/buyer/my-order${qs ? `?${qs}` : ""}`;
  };
  
  const myOrderHref = buildMyOrderHref();

  return (
    <header className="w-full h-16 bg-background border-b border-border flex items-center justify-between px-6 sticky top-0 z-50">
      {/* Left: Brand */}
      <div className="flex items-center gap-3">
        <IconBox size="sm" variant="primary">
          <Compass className="h-5 w-5" />
        </IconBox>
        <Divider orientation="vertical" />
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold tracking-tight">{BRAND_NAME}</span>
          <span className="text-muted-foreground text-sm">/</span>
          <span className="text-sm font-medium text-muted-foreground">{APP_NAME}</span>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-4">
        {/* Cart/Order Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant={displayItems > 0 ? "default" : "outline"}
              size="sm"
            >
              <ShoppingCart className="h-4 w-4" />
              {displayItems > 0 ? (
                <>
                  <span>{displayItems}</span>
                  <span className="mx-1 opacity-50">|</span>
                  <span>{formatCurrency(displayPrice, currency)}</span>
                </>
              ) : (
                <span>Review Order</span>
              )}
              <ChevronDown className="h-3 w-3 ml-1 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={myOrderHref} className="cursor-pointer">
                <ExternalLink className="h-4 w-4" />
                View Order
              </Link>
            </DropdownMenuItem>
            {displayItems > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setShowClearConfirm(true)}
                >
                  <Trash2 className="h-4 w-4" />
                  Clear Cart
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Clear Cart Confirmation Dialog */}
        <Dialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
          <DialogContent showCloseButton={false}>
            <DialogHeader>
              <DialogTitle>Clear your cart?</DialogTitle>
              <DialogDescription>
                This will remove all {displayItems} item{displayItems !== 1 ? 's' : ''} from your cart. This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowClearConfirm(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleClearCart}>
                Clear Cart
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Divider orientation="vertical" />

        {/* Status Indicator */}
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-secondary rounded-full border border-border">
          <IndicatorDot status="success" pulse />
          <span className="text-xs font-medium text-muted-foreground">Systems Operational</span>
        </div>

        {/* Currency Toggle */}
        <CurrencyToggle size="sm" className="hidden md:flex" />

        <Divider orientation="vertical" className="hidden md:block" />

        <Button variant="ghost" size="icon" aria-label="Search">
          <Search className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Notifications">
          <Bell className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Help">
          <HelpCircle className="h-4 w-4" />
        </Button>

        <Badge size="md" variant="default">
          {userInitials}
        </Badge>
      </div>
    </header>
  );
}
