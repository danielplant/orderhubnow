'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { OrdersPendingTransferTable } from './orders-pending-transfer-table'

interface OrdersPendingTransferTableClientProps {
  orders: Array<{
    id: string
    orderNumber: string
    storeName: string
    orderAmount: number
    orderDate: string // ISO string from server
    salesRep: string
  }>
  total: number
  page: number
}

export function OrdersPendingTransferTableClient({
  orders,
  total,
  page,
}: OrdersPendingTransferTableClientProps) {
  const router = useRouter()

  // Convert ISO date strings back to Date objects
  const ordersWithDates = React.useMemo(
    () =>
      orders.map((o) => ({
        ...o,
        orderDate: new Date(o.orderDate),
      })),
    [orders]
  )

  const handlePageChange = React.useCallback(
    (newPage: number) => {
      const params = new URLSearchParams(window.location.search)
      params.set('tab', 'transfer')
      params.set('page', String(newPage))
      router.push(`?${params.toString()}`, { scroll: false })
    },
    [router]
  )

  return (
    <OrdersPendingTransferTable
      orders={ordersWithDates}
      total={total}
      page={page}
      onPageChange={handlePageChange}
    />
  )
}
