import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth/providers'
import { getOrdersByRep } from '@/lib/data/queries/orders'
import { RepOrdersTable } from '@/components/rep/rep-orders-table'

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>
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

  return (
    <div className="p-6 lg:p-10 bg-muted/30">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-foreground">My Orders</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Orders assigned to you
        </p>
      </div>

      <RepOrdersTable
        orders={orders}
        total={total}
        statusCounts={statusCounts}
      />
    </div>
  )
}
