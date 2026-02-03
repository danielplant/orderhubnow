'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  ArrowLeft,
  Calendar,
  RefreshCw,
  Mail,
  CheckCircle,
  AlertTriangle,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  bulkUpdateShipmentDates,
  notifyShipmentDateChanges,
} from '@/lib/data/actions/collections'
import type { AffectedOrder } from '@/lib/types/planned-shipment'

interface AffectedOrdersClientProps {
  collection: {
    id: number
    name: string
    oldStart: string | null
    oldEnd: string | null
  }
  newWindowStart: string
  newWindowEnd: string
  affected: AffectedOrder[]
  totalOrders: number
  totalShipments: number
  invalidCount: number
  shopifyExcludedCount: number
}

export function AffectedOrdersClient({
  collection,
  newWindowStart,
  newWindowEnd,
  affected,
  totalOrders,
  totalShipments,
  invalidCount: _invalidCount,
  shopifyExcludedCount,
}: AffectedOrdersClientProps) {
  const router = useRouter()
  
  // Filter to invalid-only shipments per business requirement
  // Only show shipments that would become invalid with new dates
  const invalidAffected = affected.filter((a) => a.isInvalid)
  
  const [selected, setSelected] = useState<Set<string>>(
    new Set(invalidAffected.map((a) => a.shipmentId))
  )
  const [updatedIds, setUpdatedIds] = useState<Set<string>>(new Set())
  const [notifiedReps, setNotifiedReps] = useState<Set<string>>(new Set())
  const [notifiedCustomers, setNotifiedCustomers] = useState<Set<string>>(
    new Set()
  )
  const [isUpdating, setIsUpdating] = useState(false)
  const [isNotifying, setIsNotifying] = useState(false)

  const formatDate = (d: string | null) => {
    if (!d) return '-'
    // Extract date-only part and force local midnight (avoids UTC timezone shift)
    const dateOnly = d.split('T')[0]
    return new Date(dateOnly + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
  }

  function toggleAll(checked: boolean) {
    if (checked) {
      setSelected(new Set(invalidAffected.map((a) => a.shipmentId)))
    } else {
      setSelected(new Set())
    }
  }

  function toggleOne(shipmentId: string) {
    const next = new Set(selected)
    if (next.has(shipmentId)) {
      next.delete(shipmentId)
    } else {
      next.add(shipmentId)
    }
    setSelected(next)
  }

  async function handleBulkUpdate(shipmentIds: string[]) {
    setIsUpdating(true)
    try {
      const result = await bulkUpdateShipmentDates({
        shipmentIds,
        newStart: newWindowStart,
        newEnd: newWindowEnd,
        collectionId: collection.id,
        collectionName: collection.name,
      })
      if (result.success) {
        setUpdatedIds((prev) => new Set([...prev, ...shipmentIds]))
        toast.success(`Updated ${result.updatedCount} shipment(s)`)
        router.refresh() // Refresh server data to reflect updates
      } else {
        toast.error(result.error || 'Failed to update')
      }
    } finally {
      setIsUpdating(false)
    }
  }

  async function handleNotify(
    shipmentIds: string[],
    notifyReps: boolean,
    notifyCustomers: boolean
  ) {
    setIsNotifying(true)
    try {
      const result = await notifyShipmentDateChanges({
        shipmentIds,
        notifyReps,
        notifyCustomers,
        collectionName: collection.name,
        oldStart: collection.oldStart ?? '',
        oldEnd: collection.oldEnd ?? '',
        newStart: newWindowStart,
        newEnd: newWindowEnd,
      })
      if (result.success) {
        if (notifyReps)
          setNotifiedReps((prev) => new Set([...prev, ...shipmentIds]))
        if (notifyCustomers)
          setNotifiedCustomers((prev) => new Set([...prev, ...shipmentIds]))
        toast.success(`Sent ${result.emailsSent} notification(s)`)
      } else {
        toast.error(result.errors?.[0] || 'Failed to send notifications')
      }
    } finally {
      setIsNotifying(false)
    }
  }

  const selectedArray = Array.from(selected)
  // All displayed items are invalid, just filter out already updated ones
  const invalidNotUpdated = invalidAffected.filter(
    (a) => !updatedIds.has(a.shipmentId)
  )

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link href="/admin/collections">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-semibold">
            {collection.name} - Affected Orders
          </h1>
          <p className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
            <Calendar className="h-4 w-4" />
            Ship window changed to: {formatDate(newWindowStart)} -{' '}
            {formatDate(newWindowEnd)}
          </p>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="p-4 bg-muted rounded-lg text-center">
          <div className="text-2xl font-bold">{totalOrders}</div>
          <div className="text-sm text-muted-foreground">Orders</div>
        </div>
        <div className="p-4 bg-muted rounded-lg text-center">
          <div className="text-2xl font-bold">{totalShipments}</div>
          <div className="text-sm text-muted-foreground">Shipments</div>
        </div>
        <div className="p-4 bg-destructive/10 rounded-lg text-center">
          <div className="text-2xl font-bold text-destructive">
            {invalidNotUpdated.length}
          </div>
          <div className="text-sm text-muted-foreground">Need Update</div>
        </div>
        <div className="p-4 bg-green-500/10 rounded-lg text-center">
          <div className="text-2xl font-bold text-green-600">
            {updatedIds.size}
          </div>
          <div className="text-sm text-muted-foreground">Updated</div>
        </div>
      </div>

      {shopifyExcludedCount > 0 && (
        <p className="text-sm text-muted-foreground mb-4">
          Note: {shopifyExcludedCount} orders already transferred to Shopify are
          excluded.
        </p>
      )}

      {/* Bulk actions */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          disabled={invalidNotUpdated.length === 0 || isUpdating}
          onClick={() =>
            handleBulkUpdate(invalidNotUpdated.map((a) => a.shipmentId))
          }
        >
          {isUpdating ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-1" />
          )}
          Update All Invalid ({invalidNotUpdated.length})
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={selectedArray.length === 0 || isUpdating}
          onClick={() => handleBulkUpdate(selectedArray)}
        >
          Update Selected ({selectedArray.length})
        </Button>
        <div className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          disabled={selectedArray.length === 0 || isNotifying}
          onClick={() => handleNotify(selectedArray, true, false)}
        >
          <Mail className="h-4 w-4 mr-1" />
          Notify Reps ({selectedArray.length})
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={selectedArray.length === 0 || isNotifying}
          onClick={() => handleNotify(selectedArray, false, true)}
        >
          <Mail className="h-4 w-4 mr-1" />
          Notify Customers ({selectedArray.length})
        </Button>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="p-3 w-10">
                <Checkbox
                  checked={selected.size === invalidAffected.length && invalidAffected.length > 0}
                  onCheckedChange={(checked) => toggleAll(!!checked)}
                />
              </th>
              <th className="text-left p-3">Order</th>
              <th className="text-left p-3">Store</th>
              <th className="text-left p-3">Rep</th>
              <th className="text-left p-3">Current Dates</th>
              <th className="text-left p-3">Suggested</th>
              <th className="text-center p-3">Status</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {invalidAffected.map((order) => {
              const isUpdated = updatedIds.has(order.shipmentId)
              const repNotified = notifiedReps.has(order.shipmentId)
              const custNotified = notifiedCustomers.has(order.shipmentId)

              return (
                <tr key={order.shipmentId} className="border-t">
                  <td className="p-3">
                    <Checkbox
                      checked={selected.has(order.shipmentId)}
                      onCheckedChange={() => toggleOne(order.shipmentId)}
                    />
                  </td>
                  <td className="p-3">
                    <Link
                      href={`/admin/orders/${order.orderId}`}
                      className="font-mono text-xs text-blue-600 hover:underline"
                    >
                      {order.orderNumber}
                    </Link>
                  </td>
                  <td className="p-3 truncate max-w-[120px]">
                    {order.storeName || '-'}
                  </td>
                  <td className="p-3 truncate max-w-[100px]">
                    {order.repName || '-'}
                  </td>
                  <td className="p-3 text-xs">
                    <span
                      className={
                        order.isStartInvalid
                          ? 'text-destructive font-medium'
                          : ''
                      }
                    >
                      {formatDate(order.currentStart)}
                    </span>
                    {' - '}
                    <span
                      className={
                        order.isEndInvalid
                          ? 'text-destructive font-medium'
                          : ''
                      }
                    >
                      {formatDate(order.currentEnd)}
                    </span>
                  </td>
                  <td className="p-3 text-xs">
                    {order.isInvalid ? (
                      <span className="text-green-600">
                        {formatDate(order.suggestedStart)} -{' '}
                        {formatDate(order.suggestedEnd)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        No change needed
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-center">
                    {isUpdated ? (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Updated
                      </span>
                    ) : order.isInvalid ? (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-destructive/10 text-destructive">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        Invalid
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                        Valid
                      </span>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1 flex-wrap">
                      {!isUpdated && order.isInvalid && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          disabled={isUpdating}
                          onClick={() => handleBulkUpdate([order.shipmentId])}
                        >
                          Update
                        </Button>
                      )}
                      {order.repEmail && !repNotified && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          disabled={isNotifying}
                          onClick={() =>
                            handleNotify([order.shipmentId], true, false)
                          }
                        >
                          Rep
                        </Button>
                      )}
                      {order.customerEmail && !custNotified && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          disabled={isNotifying}
                          onClick={() =>
                            handleNotify([order.shipmentId], false, true)
                          }
                        >
                          Cust
                        </Button>
                      )}
                      {repNotified && (
                        <span className="text-xs text-green-600">Rep</span>
                      )}
                      {custNotified && (
                        <span className="text-xs text-green-600">Cust</span>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {invalidAffected.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          No invalid shipments found. All affected orders have valid ship dates.
        </div>
      )}
    </div>
  )
}
