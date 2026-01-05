import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Plus } from 'lucide-react'
import { auth } from '@/lib/auth/providers'
import { getOrdersByRep } from '@/lib/data/queries/orders'
import { RepOrdersTable } from '@/components/rep/rep-orders-table'
import { Button } from '@/components/ui/button'
import { OrderSubmittedToast } from '@/components/rep/order-submitted-toast'
import { ErrorToast } from '@/components/rep/error-toast'

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

// Map error codes to user-friendly messages
const ERROR_MESSAGES: Record<string, string> = {
  rep_not_configured: 'Your account is not configured as a sales rep. Please contact an administrator.',
}

/**
 * Rep Orders page - shows orders filtered by logged-in rep's name.
 * Matches .NET RepOrders.aspx behavior.
 */
export default async function RepOrdersPage({ searchParams }: Props) {
  const session = await auth()

  // Auth check - must be rep with valid repId
  if (!session?.user || session.user.role !== 'rep' || !session.user.repId) {
    redirect('/rep/login')
  }

  const params = await searchParams
  const { orders, total, statusCounts } = await getOrdersByRep(
    session.user.repId,
    params
  )

  // Check for order submission callback
  const submittedOrder = typeof params.submitted === 'string' ? params.submitted : null
  const customerName = typeof params.customer === 'string' ? params.customer : null

  // Check for error messages
  const errorCode = typeof params.error === 'string' ? params.error : null
  const errorMessage = errorCode ? ERROR_MESSAGES[errorCode] : null

  // Build "New Order" link with rep context
  const newOrderHref = `/buyer/select-journey?repId=${session.user.repId}&returnTo=${encodeURIComponent('/rep/orders')}`

  return (
    <div className="p-6 lg:p-10 bg-muted/30">
      {submittedOrder && (
        <OrderSubmittedToast orderNumber={submittedOrder} customerName={customerName} />
      )}
      {errorMessage && (
        <ErrorToast message={errorMessage} />
      )}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">My Orders</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Orders assigned to you
          </p>
        </div>
        <Button asChild>
          <Link href={newOrderHref}>
            <Plus className="size-4 mr-2" />
            New Order
          </Link>
        </Button>
      </div>

      <RepOrdersTable
        orders={orders}
        total={total}
        statusCounts={statusCounts}
      />
    </div>
  )
}
