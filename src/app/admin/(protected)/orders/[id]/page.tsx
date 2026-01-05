import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth/providers'
import { prisma } from '@/lib/prisma'
import { formatCurrency } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle, Button, StatusBadge } from '@/components/ui'
import { OrderEditForm } from '@/components/admin/order-edit-form'
import type { OrderStatus } from '@/lib/types/order'

function getStatusBadgeStatus(status: OrderStatus) {
  switch (status) {
    case 'Cancelled':
      return 'cancelled'
    case 'Invoiced':
      return 'invoiced'
    case 'Shipped':
      return 'shipped'
    case 'Processing':
      return 'processing'
    case 'Pending':
    default:
      return 'pending'
  }
}

export default async function AdminOrderDetailsPage(props: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'admin') {
    redirect('/admin/login')
  }

  const { id } = await props.params
  const orderId = parseInt(id, 10)
  if (!Number.isFinite(orderId) || orderId <= 0) {
    notFound()
  }

  const order = await prisma.customerOrders.findUnique({
    where: { ID: BigInt(orderId) },
    select: {
      ID: true,
      OrderNumber: true,
      OrderStatus: true,
      StoreName: true,
      BuyerName: true,
      SalesRep: true,
      CustomerEmail: true,
      CustomerPhone: true,
      Country: true, // legacy: stores currency
      OrderAmount: true,
      CustomerPO: true,
      OrderNotes: true,
      ShipStartDate: true,
      ShipEndDate: true,
      OrderDate: true,
      Website: true,
      IsTransferredToShopify: true,
      // Shipping/adjustment fields
      ShippingCost: true,
      TrackingNumber: true,
      ShipDate: true,
      InvoiceNumber: true,
      ShippedAmount: true,
    },
  })

  if (!order) {
    notFound()
  }

  const [items, comments] = await Promise.all([
    prisma.customerOrdersItems.findMany({
      where: { CustomerOrderID: BigInt(orderId) },
      select: {
        ID: true,
        SKU: true,
        Quantity: true,
        Price: true,
        PriceCurrency: true,
        ShippedQuantity: true,
      },
      orderBy: { SKU: 'asc' },
    }),
    prisma.customerOrdersComments.findMany({
      where: { OrderID: BigInt(orderId) },
      select: {
        ID: true,
        Comments: true,
        AddedDate: true,
        AddedBy: true,
      },
      orderBy: { AddedDate: 'desc' },
    }),
  ])

  const currency: 'USD' | 'CAD' = order.Country?.toUpperCase().includes('CAD') ? 'CAD' : 'USD'
  const status = order.OrderStatus as OrderStatus

  const itemsTotal = items.reduce((sum: number, i) => sum + (i.Price || 0) * (i.Quantity || 0), 0)
  const shippedTotal = order.ShippedAmount ?? itemsTotal

  // Calculate difference between order and shipped
  const difference = order.OrderAmount - shippedTotal

  return (
    <main className="p-10 bg-muted/30 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <div className="space-y-1">
          <div className="text-sm text-muted-foreground">
            <Link href="/admin/orders" className="hover:underline">
              Orders
            </Link>
            <span className="px-2">/</span>
            <span>{order.OrderNumber}</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-foreground">
              Order {order.OrderNumber}
            </h1>
            <StatusBadge status={getStatusBadgeStatus(status)}>{status}</StatusBadge>
            <span className="text-sm text-muted-foreground">
              {order.IsTransferredToShopify ? 'In Shopify' : 'Not transferred'}
            </span>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <a href={`/api/orders/${order.ID.toString()}/pdf`} target="_blank" rel="noreferrer">
              PDF
            </a>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/admin/orders">Back</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Order Info */}
        <Card>
          <CardHeader>
            <CardTitle>Order Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Store</span>
              <span className="font-medium">{order.StoreName}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Buyer</span>
              <span className="font-medium">{order.BuyerName}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Rep</span>
              <span className="font-medium">{order.SalesRep || '—'}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Email</span>
              <span className="font-medium">{order.CustomerEmail}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Phone</span>
              <span className="font-medium">{order.CustomerPhone || '—'}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Currency</span>
              <span className="font-medium">{currency}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Ship Window</span>
              <span className="font-medium">
                {order.ShipStartDate && order.ShipEndDate
                  ? `${order.ShipStartDate.toISOString().slice(0, 10)} – ${order.ShipEndDate
                      .toISOString()
                      .slice(0, 10)}`
                  : '—'}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Order Date</span>
              <span className="font-medium">{order.OrderDate.toISOString().slice(0, 10)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Customer PO</span>
              <span className="font-medium">{order.CustomerPO || '—'}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Website</span>
              <span className="font-medium">{order.Website || '—'}</span>
            </div>
            <div className="flex justify-between gap-4 pt-2 border-t border-border">
              <span className="text-muted-foreground">Order Total</span>
              <span className="font-semibold">{formatCurrency(order.OrderAmount, currency)}</span>
            </div>
            {order.ShippedAmount != null && (
              <>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Shipped Total</span>
                  <span className="font-semibold">{formatCurrency(order.ShippedAmount, currency)}</span>
                </div>
                {Math.abs(difference) > 0.01 && (
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Difference</span>
                    <span className={`font-medium ${difference > 0 ? 'text-destructive' : 'text-success'}`}>
                      {difference > 0 ? '-' : '+'}
                      {formatCurrency(Math.abs(difference), currency)}
                    </span>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Shipping Info */}
        <Card>
          <CardHeader>
            <CardTitle>Shipping Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Shipping Cost</span>
              <span className="font-medium">
                {order.ShippingCost != null ? formatCurrency(order.ShippingCost, currency) : '—'}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Tracking Number</span>
              <span className="font-medium">{order.TrackingNumber || '—'}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Ship Date</span>
              <span className="font-medium">
                {order.ShipDate ? order.ShipDate.toISOString().slice(0, 10) : '—'}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Invoice Number</span>
              <span className="font-medium">{order.InvoiceNumber || '—'}</span>
            </div>
          </CardContent>
        </Card>

        {/* Notes */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground whitespace-pre-wrap">
            {order.OrderNotes?.trim() ? order.OrderNotes : '—'}
          </CardContent>
        </Card>

        {/* Line Items - Read Only */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Line Items</CardTitle>
          </CardHeader>
          <CardContent>
            {items.length === 0 ? (
              <div className="text-sm text-muted-foreground">No items found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b border-border">
                      <th className="py-2 pr-4">SKU</th>
                      <th className="py-2 pr-4 text-right">Ordered</th>
                      <th className="py-2 pr-4 text-right">Shipped</th>
                      <th className="py-2 pr-4 text-right">Unit</th>
                      <th className="py-2 pr-4 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((i) => {
                      const shippedQty = i.ShippedQuantity ?? i.Quantity
                      const lineTotal = (i.Price || 0) * shippedQty
                      const qtyDiff = (i.Quantity || 0) - shippedQty
                      return (
                        <tr key={String(i.ID)} className="border-b border-border">
                          <td className="py-2 pr-4 font-medium">{i.SKU}</td>
                          <td className="py-2 pr-4 text-right">{i.Quantity}</td>
                          <td className="py-2 pr-4 text-right">
                            {shippedQty}
                            {qtyDiff !== 0 && (
                              <span className={`ml-1 text-xs ${qtyDiff > 0 ? 'text-destructive' : 'text-success'}`}>
                                ({qtyDiff > 0 ? '-' : '+'}{Math.abs(qtyDiff)})
                              </span>
                            )}
                          </td>
                          <td className="py-2 pr-4 text-right">
                            {formatCurrency(i.Price || 0, (i.PriceCurrency as 'USD' | 'CAD') || currency)}
                          </td>
                          <td className="py-2 pr-4 text-right font-medium">
                            {formatCurrency(lineTotal, (i.PriceCurrency as 'USD' | 'CAD') || currency)}
                          </td>
                        </tr>
                      )
                    })}
                    <tr>
                      <td className="py-3 pr-4" />
                      <td className="py-3 pr-4" />
                      <td className="py-3 pr-4" />
                      <td className="py-3 pr-4 text-right text-muted-foreground">Items total</td>
                      <td className="py-3 pr-4 text-right font-semibold">
                        {formatCurrency(itemsTotal, currency)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Edit Form - Shipping & Adjustments */}
        <div className="lg:col-span-2">
          <OrderEditForm
            orderId={id}
            currency={currency}
            orderAmount={order.OrderAmount}
            shippingCost={order.ShippingCost}
            trackingNumber={order.TrackingNumber}
            shipDate={order.ShipDate ? order.ShipDate.toISOString().slice(0, 10) : null}
            invoiceNumber={order.InvoiceNumber}
            items={items.map((i) => ({
              id: String(i.ID),
              sku: i.SKU,
              quantity: i.Quantity,
              shippedQuantity: i.ShippedQuantity,
              price: i.Price,
              currency,
            }))}
          />
        </div>

        {/* Comments */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Comments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {comments.length === 0 ? (
              <div className="text-sm text-muted-foreground">No comments.</div>
            ) : (
              comments.map((c) => (
                <div key={String(c.ID)} className="rounded-md border border-border bg-background p-3">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                    <span>{c.AddedBy}</span>
                    <span>{c.AddedDate.toLocaleString()}</span>
                  </div>
                  <div className="text-sm whitespace-pre-wrap">{c.Comments}</div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
