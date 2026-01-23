import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Plus } from 'lucide-react'
import { auth } from '@/lib/auth/providers'
import { getOrdersByRep } from '@/lib/data/queries/orders'
import { RepOrdersTable } from '@/components/rep/rep-orders-table'
import { Button } from '@/components/ui/button'
import { OrderSubmittedToast } from '@/components/rep/order-submitted-toast'
import { getEffectiveRepId, isViewAsMode, buildRepHref } from '@/lib/utils/auth'

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/**
 * Rep Orders page - shows orders filtered by logged-in rep's name.
 * Supports admin view-as mode.
 */
export default async function RepOrdersPage({ searchParams }: Props) {
  const session = await auth()
  const params = await searchParams

  // Create a URLSearchParams-like object for the auth helpers
  const searchParamsMap = {
    get: (key: string) => {
      const val = params[key]
      return typeof val === 'string' ? val : null
    },
  }

  // Get effective repId (from view-as or session)
  const effectiveRepId = getEffectiveRepId(session, searchParamsMap)
  const viewAsMode = isViewAsMode(session, searchParamsMap)

  // Must have a valid repId to view orders
  if (!effectiveRepId) {
    redirect(viewAsMode ? '/admin' : '/login')
  }

  const { orders, total, statusCounts } = await getOrdersByRep(effectiveRepId, params)

  // Check for order submission callback
  const submittedOrder = typeof params.submitted === 'string' ? params.submitted : null
  const customerName = typeof params.customer === 'string' ? params.customer : null

  // Build view-as params for link building
  const adminViewAs = typeof params.adminViewAs === 'string' ? params.adminViewAs : null
  const repNameParam = typeof params.repName === 'string' ? params.repName : null
  const viewAsParams = adminViewAs ? { repId: adminViewAs, repName: repNameParam ?? undefined } : null

  // Build "New Order" link with rep context
  const repId = String(effectiveRepId)
  const repName = viewAsMode
    ? (repNameParam || null)
    : (session?.user?.name || null)
  const newOrderParams = new URLSearchParams({ repId, returnTo: buildRepHref('/rep/orders', viewAsParams) })
  if (repName) newOrderParams.set('repName', repName)
  if (adminViewAs) newOrderParams.set('adminViewAs', adminViewAs)
  const newOrderHref = `/buyer/select-journey?${newOrderParams.toString()}`

  return (
    <div className="p-6 lg:p-10 bg-muted/30">
      {submittedOrder && (
        <OrderSubmittedToast
          orderNumber={submittedOrder}
          customerName={customerName}
          viewAsParams={viewAsParams}
        />
      )}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">My Orders</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Orders assigned to {viewAsMode ? repName || 'this rep' : 'you'}
          </p>
        </div>
        {/* Hide New Order button in view-as mode (read-only) */}
        {!viewAsMode && (
          <Button asChild>
            <Link href={newOrderHref}>
              <Plus className="size-4 mr-2" />
              New Order
            </Link>
          </Button>
        )}
      </div>

      <RepOrdersTable
        orders={orders}
        total={total}
        statusCounts={statusCounts}
        repId={repId}
        repName={repName}
        isReadOnly={viewAsMode}
      />
    </div>
  )
}
