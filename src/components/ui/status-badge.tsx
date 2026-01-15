import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * StatusBadge - displays order/sync status with semantic colors.
 *
 * Uses bg-muted with colored text for now. Future enhancement:
 * Add explicit -bg/-text token pairs (like ats/preorder) for
 * stronger visual distinction when scanning order tables.
 */
const statusBadgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize',
  {
    variants: {
      status: {
        pending: 'bg-muted border-border text-warning',
        processing: 'bg-muted border-border text-info',
        'partially-shipped': 'bg-warning/10 border-warning/20 text-warning',
        shipped: 'bg-muted border-border text-success',
        invoiced: 'bg-preorder-bg border-preorder/20 text-preorder-text',
        cancelled: 'bg-muted border-border text-error',
        new: 'bg-muted border-border text-info',
        fulfilled: 'bg-ats-bg border-ats/20 text-ats-text',
        unfulfilled: 'bg-muted border-border text-warning',
      },
    },
    defaultVariants: {
      status: 'pending',
    },
  }
)

export interface StatusBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof statusBadgeVariants> {
  children?: React.ReactNode
}

export function StatusBadge({ status, className, children, ...props }: StatusBadgeProps) {
  return (
    <span className={cn(statusBadgeVariants({ status }), className)} {...props}>
      {children ?? status}
    </span>
  )
}

export { statusBadgeVariants }
