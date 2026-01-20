'use client'

import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * OrderTypeBadge - displays order type (ATS, Pre-Order, Draft) with semantic colors.
 * Derives type from order number prefix: A = ATS, P = Pre-Order, D = Draft
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
 * Derive order type from order number prefix.
 * - 'A' prefix = ATS (Available to Ship)
 * - 'P' prefix = Pre-Order
 * - 'D' or other = Draft
 */
export function getOrderType(orderNumber: string): OrderType {
  const prefix = orderNumber.charAt(0).toUpperCase()
  if (prefix === 'A') return 'ats'
  if (prefix === 'P') return 'preorder'
  return 'draft'
}

export interface OrderTypeBadgeProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'>,
    VariantProps<typeof orderTypeBadgeVariants> {
  orderNumber: string
}

export function OrderTypeBadge({ orderNumber, className, ...props }: OrderTypeBadgeProps) {
  const type = getOrderType(orderNumber)
  const { label } = TYPE_CONFIG[type]

  return (
    <span className={cn(orderTypeBadgeVariants({ type }), className)} {...props}>
      {label}
    </span>
  )
}

export { orderTypeBadgeVariants }
