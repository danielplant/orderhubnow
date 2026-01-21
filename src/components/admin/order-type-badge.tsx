'use client'

import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * OrderTypeBadge - displays order type (ATS, Pre-Order, Draft) with semantic colors.
 * 
 * Order type is determined by (in priority order):
 * 1. isPreOrder prop (from DB, SkuCategories.IsPreOrder) - preferred
 * 2. Order number prefix fallback for legacy orders
 */
const orderTypeBadgeVariants = cva(
  'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
  {
    variants: {
      type: {
        ats: 'bg-ats-bg border-ats/20 text-ats-text',
        preorder: 'bg-preorder-bg border-preorder/20 text-preorder-text',
        draft: 'bg-muted border-border text-muted-foreground',
      },
    },
    defaultVariants: {
      type: 'draft',
    },
  }
)

type OrderType = 'ats' | 'preorder' | 'draft'

const TYPE_CONFIG: Record<OrderType, { label: string }> = {
  ats: { label: 'ATS' },
  preorder: { label: 'Pre-Order' },
  draft: { label: 'Draft' },
}

/**
 * Derive order type from database field or order number prefix.
 * 
 * @param isPreOrder - From DB (SkuCategories.IsPreOrder), takes precedence
 * @param orderNumber - Fallback: prefix A = ATS, P = Pre-Order, D = Draft
 */
export function getOrderType(orderNumber: string, isPreOrder?: boolean): OrderType {
  // Draft orders (D prefix) are always drafts
  if (orderNumber.charAt(0).toUpperCase() === 'D') {
    return 'draft'
  }
  
  // Use isPreOrder from DB if available
  if (isPreOrder !== undefined) {
    return isPreOrder ? 'preorder' : 'ats'
  }
  
  // Fallback to order number prefix for legacy orders
  const prefix = orderNumber.charAt(0).toUpperCase()
  if (prefix === 'A') return 'ats'
  if (prefix === 'P') return 'preorder'
  return 'draft'
}

export interface OrderTypeBadgeProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'>,
    VariantProps<typeof orderTypeBadgeVariants> {
  orderNumber: string
  /** From DB: CustomerOrders.IsPreOrder (derived from SkuCategories.IsPreOrder) */
  isPreOrder?: boolean
}

export function OrderTypeBadge({ orderNumber, isPreOrder, className, ...props }: OrderTypeBadgeProps) {
  const type = getOrderType(orderNumber, isPreOrder)
  const { label } = TYPE_CONFIG[type]

  return (
    <span className={cn(orderTypeBadgeVariants({ type }), className)} {...props}>
      {label}
    </span>
  )
}

export { orderTypeBadgeVariants }
