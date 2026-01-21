'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { StatusBadge } from '@/components/ui/status-badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Loader2, CheckCircle2, XCircle, AlertTriangle, ExternalLink, Edit } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ShopifyValidationResult, TransferTag } from '@/lib/types/shopify'

export interface TransferPreviewModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  validation: ShopifyValidationResult | null
  isLoading: boolean
  onTransfer: (enabledTagIds?: string[]) => void
  isTransferring: boolean
  transferError?: string | null
}

export function TransferPreviewModal({
  open,
  onOpenChange,
  validation,
  isLoading,
  onTransfer,
  isTransferring,
  transferError,
}: TransferPreviewModalProps) {
  const [tagStates, setTagStates] = React.useState<Record<string, boolean>>({})

  React.useEffect(() => {
    if (validation?.tags) {
      const initialStates: Record<string, boolean> = {}
      for (const tag of validation.tags) {
        initialStates[tag.id] = tag.enabled
      }
      setTagStates(initialStates)
    }
  }, [validation?.tags])

  if (!validation && !isLoading) return null

  const blockedCount = (validation?.missingSkus.length ?? 0) + (validation?.inactiveSkus.length ?? 0)
  const orderTags = validation?.tags?.filter((t) => t.scope === 'order') ?? []
  const customerTags = validation?.tags?.filter((t) => t.scope === 'customer') ?? []
  const hasWarnings = validation?.inventoryStatus.some((item) => item.status !== 'ok')

  const enabledCount = Object.values(tagStates).filter(Boolean).length
  const totalCount = validation?.tags?.length ?? 0

  const invalidEnabledTags = validation?.tags?.filter(
    (t) => tagStates[t.id] !== false && !t.validation.valid
  ) ?? []
  const hasInvalidEnabledTags = invalidEnabledTags.length > 0

  const canTransfer = blockedCount === 0

  const toggleTag = (tagId: string) => {
    setTagStates((prev) => ({ ...prev, [tagId]: !prev[tagId] }))
  }

  const handleTransfer = () => {
    const enabledTagIds = Object.entries(tagStates)
      .filter(([, enabled]) => enabled)
      .map(([id]) => id)
    onTransfer(enabledTagIds)
  }

  const getTagSourceLabel = (source: TransferTag['source']): string => {
    const labels: Record<string, string> = {
      orderType: 'Order Type',
      wholesale: 'Wholesale',
      oscIgnore: 'OSC Ignore',
      salesRep: 'Sales Rep',
      shipWindow: 'Ship Window',
      season: 'Season',
      ohnCollection: 'OHN Collection',
      shopifyCollection: 'Shopify Collection',
      customerWholesale: 'Wholesale',
      customerSalesRep: 'Sales Rep',
    }
    return labels[source] || source
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-xl">
            Transfer Preview
            {validation && (
              <StatusBadge status="new" className="font-mono">
                {validation.orderNumber}
              </StatusBadge>
            )}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="ml-3 text-muted-foreground">Validating order for transfer...</span>
          </div>
        ) : validation ? (
          <div className="space-y-6">
            {/* Status Banner */}
            <div
              className={cn(
                'flex items-center gap-4 p-4 rounded-lg border',
                transferError
                  ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'
                  : hasInvalidEnabledTags
                    ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800'
                    : canTransfer
                      ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800'
                      : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'
              )}
            >
              {transferError ? (
                <>
                  <XCircle className="h-6 w-6 text-red-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-red-800 dark:text-red-200">Transfer Failed</p>
                    <p className="text-sm text-red-700 dark:text-red-300">{transferError}</p>
                  </div>
                </>
              ) : hasInvalidEnabledTags ? (
                <>
                  <AlertTriangle className="h-6 w-6 text-amber-600 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-amber-800 dark:text-amber-200">
                      {invalidEnabledTags.length} tag(s) will be sanitized
                    </p>
                    <p className="text-sm text-amber-700 dark:text-amber-300">
                      Invalid characters will be removed automatically before transfer
                    </p>
                  </div>
                </>
              ) : canTransfer ? (
                <>
                  <CheckCircle2 className="h-6 w-6 text-green-600 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-green-800 dark:text-green-200">Ready to Transfer</p>
                    <p className="text-sm text-green-700 dark:text-green-300">All SKUs mapped and tags validated</p>
                  </div>
                </>
              ) : (
                <>
                  <XCircle className="h-6 w-6 text-red-600 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-red-800 dark:text-red-200">Cannot Transfer</p>
                    <p className="text-sm text-red-700 dark:text-red-300">{blockedCount} blocking SKU(s) must be resolved first</p>
                  </div>
                </>
              )}
            </div>

            {/* Order Summary */}
            <div>
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                Order Summary
              </h4>
              <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">Store</p>
                  <p className="font-medium">{validation.storeName}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Ship Window</p>
                  <p className="font-medium">{validation.shipWindow || '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Customer Email</p>
                  <p className="font-medium">
                    {validation.customerEmail || 'No email'}
                    {!validation.customerExists && validation.customerEmail && (
                      <span className="text-sm text-muted-foreground ml-2">(will create in Shopify)</span>
                    )}
                    {validation.customerExists && (
                      <CheckCircle2 className="inline h-4 w-4 text-green-600 ml-2" />
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">OHN Collection</p>
                  <p className="font-medium">{validation.ohnCollection || '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Line Items</p>
                  <p className="font-medium">{validation.itemCount} items</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Shopify Collection</p>
                  <p className="font-medium">{validation.shopifyCollectionRaw || '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Order Total</p>
                  <p className="text-xl font-semibold">${validation.orderAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                </div>
              </div>
            </div>

            {/* Tags */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Shopify Tags
                </h4>
                <span className="text-sm text-muted-foreground">{enabledCount}/{totalCount} enabled</span>
              </div>

              <TooltipProvider>
                <div className="border rounded-lg overflow-hidden">
                  {/* Order Tags */}
                  {orderTags.length > 0 && (
                    <div className="border-b last:border-b-0">
                      <div className="bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground uppercase">
                        Order Tags
                      </div>
                      <div className="divide-y">
                        {orderTags.map((tag) => {
                          const isEnabled = tagStates[tag.id] ?? true
                          const isInvalid = !tag.validation.valid
                          return (
                            <div
                              key={tag.id}
                              className={cn(
                                'flex items-center px-4 py-3 hover:bg-muted/30 transition-colors',
                                !isEnabled && 'opacity-50 bg-muted/20',
                                isInvalid && isEnabled && 'bg-amber-50/50 dark:bg-amber-950/20'
                              )}
                            >
                              <Checkbox
                                checked={isEnabled}
                                onCheckedChange={() => toggleTag(tag.id)}
                                className="mr-4"
                              />
                              <span className="w-36 text-sm text-muted-foreground flex-shrink-0">
                                {getTagSourceLabel(tag.source)}
                              </span>
                              <code className="flex-1 text-sm font-mono bg-muted/50 px-2 py-1 rounded">
                                {tag.value}
                              </code>
                              {isInvalid && isEnabled && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <AlertTriangle className="h-4 w-4 text-amber-500 ml-3 flex-shrink-0 cursor-help" />
                                  </TooltipTrigger>
                                  <TooltipContent side="left" className="max-w-xs">
                                    <p className="text-xs">
                                      <span className="font-medium">Original value:</span><br />
                                      <code className="text-xs">{tag.validation.originalValue}</code>
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Customer Tags */}
                  {customerTags.length > 0 && (
                    <div>
                      <div className="bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground uppercase">
                        Customer Tags
                      </div>
                      <div className="divide-y">
                        {customerTags.map((tag) => {
                          const isEnabled = tagStates[tag.id] ?? true
                          const isInvalid = !tag.validation.valid
                          return (
                            <div
                              key={tag.id}
                              className={cn(
                                'flex items-center px-4 py-3 hover:bg-muted/30 transition-colors',
                                !isEnabled && 'opacity-50 bg-muted/20',
                                isInvalid && isEnabled && 'bg-amber-50/50 dark:bg-amber-950/20'
                              )}
                            >
                              <Checkbox
                                checked={isEnabled}
                                onCheckedChange={() => toggleTag(tag.id)}
                                className="mr-4"
                              />
                              <span className="w-36 text-sm text-muted-foreground flex-shrink-0">
                                {getTagSourceLabel(tag.source)}
                              </span>
                              <code className="flex-1 text-sm font-mono bg-muted/50 px-2 py-1 rounded">
                                {tag.value}
                              </code>
                              {isInvalid && isEnabled && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <AlertTriangle className="h-4 w-4 text-amber-500 ml-3 flex-shrink-0 cursor-help" />
                                  </TooltipTrigger>
                                  <TooltipContent side="left" className="max-w-xs">
                                    <p className="text-xs">
                                      <span className="font-medium">Original value:</span><br />
                                      <code className="text-xs">{tag.validation.originalValue}</code>
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </TooltipProvider>
            </div>

            {/* Blocking Issues */}
            {blockedCount > 0 && (
              <div className="border border-red-200 dark:border-red-800 rounded-lg p-4">
                <h4 className="font-semibold text-red-800 dark:text-red-200 flex items-center gap-2 mb-3">
                  <XCircle className="h-5 w-5" />
                  Blocking Issues
                </h4>
                {validation.missingSkus.length > 0 && (
                  <div className="mb-3">
                    <p className="text-sm text-muted-foreground mb-2">Missing in Shopify ({validation.missingSkus.length}):</p>
                    <div className="flex flex-wrap gap-2">
                      {validation.missingSkus.map((sku) => (
                        <code key={sku} className="text-sm bg-red-100 dark:bg-red-900/30 px-2 py-1 rounded text-red-800 dark:text-red-200">
                          {sku}
                        </code>
                      ))}
                    </div>
                  </div>
                )}
                {validation.inactiveSkus.length > 0 && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Inactive in Shopify ({validation.inactiveSkus.length}):</p>
                    <div className="flex flex-wrap gap-2">
                      {validation.inactiveSkus.map((sku) => (
                        <code key={sku} className="text-sm bg-amber-100 dark:bg-amber-900/30 px-2 py-1 rounded text-amber-800 dark:text-amber-200">
                          {sku}
                        </code>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Inventory Warnings */}
            {hasWarnings && canTransfer && (
              <div className="border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                <h4 className="font-semibold text-yellow-800 dark:text-yellow-200 flex items-center gap-2 mb-3">
                  <AlertTriangle className="h-5 w-5" />
                  Inventory Warnings
                </h4>
                <p className="text-sm text-muted-foreground mb-3">
                  Some items have limited or no inventory (transfer will still proceed):
                </p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b">
                      <th className="pb-2 pr-4">SKU</th>
                      <th className="pb-2 pr-4">Ordered</th>
                      <th className="pb-2 pr-4">Available</th>
                      <th className="pb-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validation.inventoryStatus
                      .filter((item) => item.status !== 'ok')
                      .map((item) => (
                        <tr key={item.sku} className="border-b border-border/50 last:border-b-0">
                          <td className="py-2 pr-4 font-mono text-xs">{item.sku}</td>
                          <td className="py-2 pr-4">{item.ordered}</td>
                          <td className="py-2 pr-4">{item.available}</td>
                          <td className="py-2">
                            <StatusBadge
                              status={item.status === 'partial' ? 'partially-shipped' : 'cancelled'}
                              className="text-xs"
                            >
                              {item.status === 'partial' ? 'Partial' : 'Backorder'}
                            </StatusBadge>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : null}

        {/* Footer */}
        <div className="flex items-center gap-3 pt-6 border-t mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {validation && (
            <Button variant="outline" asChild>
              <Link href={`/buyer/my-order?editOrder=${validation.orderId}&returnTo=/admin/orders`}>
                <Edit className="h-4 w-4 mr-2" />
                Edit Order
              </Link>
            </Button>
          )}
          <div className="flex-1" />
          <Button
            onClick={handleTransfer}
            disabled={!canTransfer || isTransferring}
            size="lg"
          >
            {isTransferring ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Transferring...
              </>
            ) : transferError ? (
              <>
                Retry Transfer
                <ExternalLink className="h-4 w-4 ml-2" />
              </>
            ) : (
              <>
                Transfer to Shopify
                <ExternalLink className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
