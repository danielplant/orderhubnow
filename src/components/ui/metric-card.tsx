import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { ArrowUp, ArrowDown, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

const metricCardVariants = cva(
  'rounded-lg border border-border bg-card text-card-foreground elevation-sm',
  {
    variants: {
      size: {
        sm: 'p-4',
        md: 'p-5',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  }
)

export type TrendDirection = 'up' | 'down' | 'flat'

export interface MetricCardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof metricCardVariants> {
  label: string
  value: string | number
  change?: number // percentage change
  trend?: TrendDirection
  trendLabel?: string // e.g., "vs last month"
  icon?: React.ReactNode
}

export function MetricCard({
  label,
  value,
  change,
  trend,
  trendLabel = 'vs prior period',
  icon,
  size,
  className,
  ...props
}: MetricCardProps) {
  const TrendIcon = trend === 'up' ? ArrowUp : trend === 'down' ? ArrowDown : Minus
  const trendColor = trend === 'up' 
    ? 'text-green-600 dark:text-green-400' 
    : trend === 'down' 
      ? 'text-red-600 dark:text-red-400' 
      : 'text-muted-foreground'

  return (
    <div className={cn(metricCardVariants({ size }), className)} {...props}>
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="text-3xl font-semibold tracking-tight text-foreground">{value}</div>
        </div>

        {icon ? <div className="text-muted-foreground">{icon}</div> : null}
      </div>

      {change !== undefined && trend ? (
        <div className={cn('mt-3 flex items-center gap-1 text-sm', trendColor)}>
          <TrendIcon className="h-4 w-4" />
          <span className="font-medium">
            {change > 0 ? '+' : ''}{change.toFixed(1)}%
          </span>
          <span className="text-muted-foreground ml-1">{trendLabel}</span>
        </div>
      ) : null}
    </div>
  )
}

export { metricCardVariants }
