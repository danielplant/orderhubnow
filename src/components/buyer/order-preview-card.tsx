import type { Currency } from '@/lib/types'

export interface OrderPreviewItem {
  sku: string
  description?: string
  quantity: number
  price: number
}

export interface OrderPreview {
  id: string
  collectionId: number | null
  collectionName: string | null
  shipWindowStart: string | null
  shipWindowEnd: string | null
  items: OrderPreviewItem[]
}

export interface OrderPreviewCardProps {
  order: OrderPreview
  index: number
  currency: Currency
}

export function OrderPreviewCard({ order, index, currency }: OrderPreviewCardProps) {
  const subtotal = order.items.reduce((sum, item) => sum + item.price * item.quantity, 0)
  // Note: order.items.length is line count, not total quantity
  // For total quantity: order.items.reduce((sum, item) => sum + item.quantity, 0)
  const itemCount = order.items.length

  return (
    <div className="border rounded-lg p-4 bg-muted/30">
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-medium">
          Order {index + 1}: {order.collectionName || 'Available to Ship'}
        </h4>
        <span className="text-sm text-muted-foreground">
          {itemCount} item{itemCount !== 1 ? 's' : ''} ·{' '}
          {currency === 'CAD' ? 'C' : ''}${subtotal.toFixed(2)}
        </span>
      </div>
      {order.shipWindowStart && order.shipWindowEnd && (
        <p className="text-sm text-muted-foreground">
          Ships: {order.shipWindowStart} – {order.shipWindowEnd}
        </p>
      )}
      {!order.shipWindowStart && (
        <p className="text-sm text-muted-foreground">Uses order dates</p>
      )}
    </div>
  )
}
