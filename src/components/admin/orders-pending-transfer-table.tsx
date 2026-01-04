'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  DataTable,
  type DataTableColumn,
  Button,
  StatusBadge,
} from '@/components/ui'
import { transferOrderToShopify } from '@/lib/data/actions/shopify'
import { ArrowUpRight, Loader2 } from 'lucide-react'

// ============================================================================
// Types
// ============================================================================

interface OrderPendingTransfer {
  id: string
  orderNumber: string
  storeName: string
  orderAmount: number
  orderDate: Date
  salesRep: string
}

interface OrdersPendingTransferTableProps {
  orders: OrderPendingTransfer[]
  total: number
  page: number
  onPageChange: (page: number) => void
}

// ============================================================================
// Component
// ============================================================================

export function OrdersPendingTransferTable({
  orders,
  total,
  page,
  onPageChange,
}: OrdersPendingTransferTableProps) {
  const router = useRouter()
  const [loadingId, setLoadingId] = React.useState<string | null>(null)
  const [lastResult, setLastResult] = React.useState<{
    orderId: string
    success: boolean
    message: string
    missingSkus?: string[]
  } | null>(null)

  const handleTransfer = React.useCallback(
    async (orderId: string, orderNumber: string) => {
      setLoadingId(orderId)
      setLastResult(null)

      try {
        const result = await transferOrderToShopify(orderId)

        if (result.success) {
          setLastResult({
            orderId,
            success: true,
            message: `Order ${orderNumber} transferred successfully! Shopify Order: ${result.shopifyOrderNumber}`,
          })
          router.refresh()
        } else if (result.missingSkus && result.missingSkus.length > 0) {
          setLastResult({
            orderId,
            success: false,
            message: `Cannot transfer ${orderNumber}: ${result.missingSkus.length} SKU(s) not found in Shopify`,
            missingSkus: result.missingSkus,
          })
        } else {
          setLastResult({
            orderId,
            success: false,
            message: `Failed to transfer ${orderNumber}: ${result.error || 'Unknown error'}`,
          })
        }
      } catch (e) {
        setLastResult({
          orderId,
          success: false,
          message: `Error transferring ${orderNumber}: ${e instanceof Error ? e.message : 'Unknown error'}`,
        })
      } finally {
        setLoadingId(null)
      }
    },
    [router]
  )

  const columns = React.useMemo<Array<DataTableColumn<OrderPendingTransfer>>>(
    () => [
      {
        id: 'orderNumber',
        header: 'Order #',
        cell: (row) => (
          <span className="font-medium font-mono">{row.orderNumber}</span>
        ),
      },
      {
        id: 'storeName',
        header: 'Store',
        cell: (row) => <span>{row.storeName}</span>,
      },
      {
        id: 'salesRep',
        header: 'Rep',
        cell: (row) => (
          <span className="text-muted-foreground">{row.salesRep || '—'}</span>
        ),
      },
      {
        id: 'orderDate',
        header: 'Order Date',
        cell: (row) => (
          <span className="text-muted-foreground">
            {new Date(row.orderDate).toLocaleDateString()}
          </span>
        ),
      },
      {
        id: 'orderAmount',
        header: 'Amount',
        cell: (row) => (
          <span className="font-medium">
            ${row.orderAmount.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        cell: () => <StatusBadge status="pending">Pending</StatusBadge>,
      },
      {
        id: 'actions',
        header: '',
        cell: (row) => (
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleTransfer(row.id, row.orderNumber)}
            disabled={loadingId !== null}
          >
            {loadingId === row.id ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <ArrowUpRight className="h-4 w-4 mr-1" />
                Transfer
              </>
            )}
          </Button>
        ),
      },
    ],
    [handleTransfer, loadingId]
  )

  return (
    <div className="space-y-4">
      {/* Result Message */}
      {lastResult && (
        <div
          className={`rounded-md p-4 ${
            lastResult.success
              ? 'bg-ats-bg border border-ats text-ats-text'
              : 'bg-destructive/10 border border-destructive text-destructive'
          }`}
        >
          <p className="font-medium">{lastResult.message}</p>
          {lastResult.missingSkus && lastResult.missingSkus.length > 0 && (
            <div className="mt-2">
              <p className="text-sm">Missing SKUs:</p>
              <ul className="mt-1 text-sm font-mono">
                {lastResult.missingSkus.map((sku) => (
                  <li key={sku}>• {sku}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Data Table */}
      <DataTable
        data={orders}
        columns={columns}
        getRowId={(row) => row.id}
        enableRowSelection={false}
        pageSize={50}
        manualPagination
        page={page}
        totalCount={total}
        onPageChange={onPageChange}
      />
    </div>
  )
}
