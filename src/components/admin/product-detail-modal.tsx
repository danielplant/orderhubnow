'use client'

import * as React from 'react'
import Image from 'next/image'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

interface ProductVariant {
  sku: string
  size: string
  available: number
  onRoute: number
  priceCad: number
  priceUsd: number
}

interface ProductDetail {
  baseSku: string
  title: string
  color: string
  material: string
  imageUrl: string | null
  isPreOrder: boolean
  priceCad: number
  priceUsd: number
  msrpCad: number
  msrpUsd: number
  variants: ProductVariant[]
}

interface ProductDetailModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  product: ProductDetail | null
  highlightedSku?: string
}

export function ProductDetailModal({
  open,
  onOpenChange,
  product,
  highlightedSku,
}: ProductDetailModalProps) {
  const [imageError, setImageError] = React.useState(false)

  React.useEffect(() => {
    setImageError(false)
  }, [product?.imageUrl])

  if (!product) return null

  const formatPrice = (cad: number, usd: number) => {
    if (cad === 0 && usd === 0) return '—'
    return `CAD: ${cad.toFixed(2)} / USD: ${usd.toFixed(2)}`
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span>{product.baseSku}</span>
            <span
              className={cn(
                'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                product.isPreOrder
                  ? 'bg-purple-100 text-purple-700'
                  : 'bg-green-100 text-green-700'
              )}
            >
              {product.isPreOrder ? 'Pre-Order' : 'ATS'}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Product Image */}
          <div className="relative aspect-square bg-muted rounded-lg overflow-hidden">
            {product.imageUrl && !imageError ? (
              <Image
                src={product.imageUrl}
                alt={product.title}
                fill
                className="object-contain p-4"
                onError={() => setImageError(true)}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
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

          {/* Product Details */}
          <div className="space-y-4">
            <div>
              <h3 className="font-medium text-lg">{product.title}</h3>
              {product.color && (
                <p className="text-sm text-muted-foreground">Color: {product.color}</p>
              )}
              {product.material && (
                <p className="text-sm text-muted-foreground">Material: {product.material}</p>
              )}
            </div>

            <div className="space-y-1">
              <div className="text-sm">
                <span className="text-muted-foreground">Wholesale: </span>
                <span className="font-medium">{formatPrice(product.priceCad, product.priceUsd)}</span>
              </div>
              <div className="text-sm">
                <span className="text-muted-foreground">Retail: </span>
                <span className="font-medium">{formatPrice(product.msrpCad, product.msrpUsd)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Size Variants Table */}
        <div className="mt-6">
          <h4 className="font-medium mb-3">Size Variants ({product.variants.length})</h4>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">SKU</th>
                  <th className="px-4 py-2 text-left font-medium">Size</th>
                  <th className="px-4 py-2 text-right font-medium">Available</th>
                  <th className="px-4 py-2 text-right font-medium">On Route</th>
                </tr>
              </thead>
              <tbody>
                {product.variants.map((variant) => (
                  <tr
                    key={variant.sku}
                    className={cn(
                      'border-t',
                      highlightedSku === variant.sku && 'bg-primary/10'
                    )}
                  >
                    <td className="px-4 py-2 font-mono text-xs">{variant.sku}</td>
                    <td className="px-4 py-2">{variant.size}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{variant.available}</td>
                    <td className={cn(
                      'px-4 py-2 text-right tabular-nums',
                      variant.onRoute > 0 ? 'text-blue-600' : 'text-muted-foreground'
                    )}>
                      {variant.onRoute}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
