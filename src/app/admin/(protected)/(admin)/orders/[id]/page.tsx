import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth/providers'
import { prisma } from '@/lib/prisma'
import { formatCurrency } from '@/lib/utils'
import { formatDateTime } from '@/lib/utils/format'
import { Card, CardContent, CardHeader, CardTitle, Button, StatusBadge } from '@/components/ui'
import type { OrderStatus } from '@/lib/types/order'
import { getShipmentsForOrder, getOrderItemsWithFulfillment } from '@/lib/data/actions/shipments'
import { getPlannedShipmentsForOrder } from '@/lib/data/queries/orders'
import { LineItemsSection, ShipmentHistory, PDFSettingsCard, ShopifyStatusCard } from '@/components/admin/order-detail-client'
import { PlannedShipmentsSection } from '@/components/admin/order-detail/planned-shipments-section'
import { ActivityLogPanel } from '@/components/admin/activity-log-panel'
import { OrderEmailPanel } from '@/components/admin/order-email-panel'
import { getOrderActivityLog, getOrderEmailLogs } from '@/lib/audit/activity-logger'

function getStatusBadgeStatus(status: OrderStatus) {
  switch (status) {
    case 'Cancelled':
      return 'cancelled'
    case 'Invoiced':
      return 'invoiced'
    case 'Shipped':
      return 'shipped'
    case 'Partially Shipped':
      return 'partially-shipped'
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
      ShopifyOrderID: true,
      ShopifyFulfillmentStatus: true,
      ShopifyFinancialStatus: true,
      ShopifyStatusSyncedAt: true,
      // PDF settings fields
      PaymentTerms: true,
      ApprovalDate: true,
      BrandNotes: true,
    },
  })

  if (!order) {
    notFound()
  }

  const currency: 'USD' | 'CAD' = order.Country?.toUpperCase().includes('CAD') ? 'CAD' : 'USD'
  const status = order.OrderStatus as OrderStatus

  // Get rep details if there's a sales rep (ID for edit link, email for notifications)
  const rep = order.SalesRep
    ? await prisma.reps.findFirst({
        where: { Name: order.SalesRep },
        select: { ID: true, Email1: true, Email2: true, Name: true },
      })
    : null
  const repId = rep?.ID
  const repEmail = rep?.Email1 || rep?.Email2 || undefined
  const repName = rep?.Name || undefined

  const [itemsWithFulfillment, comments, shipments, activityLogs, emailLogs, plannedShipments] = await Promise.all([
    getOrderItemsWithFulfillment(id),
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
    getShipmentsForOrder(id),
    getOrderActivityLog(id),
    getOrderEmailLogs(id),
    getPlannedShipmentsForOrder(id),
  ])

  // Determine if planned shipment dates can be edited
  const canEditShipmentDates = status === 'Pending' && !order.IsTransferredToShopify

  // Transform items for client component
  // Use Shopify SKU (clean) when available, fallback to legacy SKU
  const items = itemsWithFulfillment.map((item) => ({
    id: item.id,
    sku: item.shopifySku ?? item.sku,
    quantity: item.orderedQuantity,
    price: item.unitPrice,
    currency: (item.priceCurrency as 'USD' | 'CAD') || currency,
    shippedQuantity: item.shippedQuantity,
    cancelledQuantity: item.cancelledQuantity,
    remainingQuantity: item.remainingQuantity,
    status: item.status,
    cancelledReason: item.cancelledReason,
    cancelledAt: item.cancelledAt,
    cancelledBy: item.cancelledBy,
  }))

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
            <Link href={`/buyer/my-order?editOrder=${order.ID.toString()}&returnTo=/admin/orders/${order.ID.toString()}${repId ? `&repId=${repId}` : ''}`}>
              Edit Order
            </Link>
          </Button>
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
                {plannedShipments.length > 1 && (
                  <span className="ml-1 text-muted-foreground">
                    ({plannedShipments.length} shipments)
                  </span>
                )}
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Buyer Notes</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground whitespace-pre-wrap">
            {order.OrderNotes?.trim() ? order.OrderNotes : '—'}
          </CardContent>
        </Card>

        <PDFSettingsCard
          orderId={id}
          paymentTerms={order.PaymentTerms || ''}
          approvalDate={order.ApprovalDate?.toISOString().slice(0, 10) || ''}
          brandNotes={order.BrandNotes || ''}
        />

        <OrderEmailPanel
          orderId={id}
          orderNumber={order.OrderNumber}
          customerEmail={order.CustomerEmail}
          repEmail={repEmail || null}
          emailLogs={emailLogs}
        />

        {order.IsTransferredToShopify && order.ShopifyOrderID && (
          <ShopifyStatusCard
            orderId={id}
            shopifyOrderId={order.ShopifyOrderID}
            fulfillmentStatus={order.ShopifyFulfillmentStatus}
            financialStatus={order.ShopifyFinancialStatus}
            lastSyncedAt={order.ShopifyStatusSyncedAt?.toISOString() ?? null}
          />
        )}

        {/* Planned Shipments - shows grouped items with editable dates */}
        {plannedShipments.length > 0 && (
          <PlannedShipmentsSection
            orderId={id}
            shipments={plannedShipments}
            currency={currency}
            editable={canEditShipmentDates}
          />
        )}

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Line Items</CardTitle>
          </CardHeader>
          <CardContent>
            {items.length === 0 ? (
              <div className="text-sm text-muted-foreground">No items found.</div>
            ) : (
              <LineItemsSection
                orderId={id}
                orderNumber={order.OrderNumber}
                orderStatus={status}
                items={items}
                currency={currency}
              />
            )}
          </CardContent>
        </Card>

        {/* Fulfillment History (actual shipments, not planned) */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Fulfillment History</CardTitle>
          </CardHeader>
          <CardContent>
            <ShipmentHistory
              orderId={id}
              orderNumber={order.OrderNumber}
              orderAmount={order.OrderAmount}
              orderStatus={status}
              shipments={shipments}
              currency={currency}
              customerEmail={order.CustomerEmail || undefined}
              repEmail={repEmail}
              repName={repName}
              plannedShipments={plannedShipments.map((ps) => ({
                id: ps.id,
                collectionName: ps.collectionName,
                plannedShipStart: ps.plannedShipStart,
                plannedShipEnd: ps.plannedShipEnd,
                status: ps.status,
                itemIds: ps.itemIds,
              }))}
            />
          </CardContent>
        </Card>

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
                    <span>{formatDateTime(c.AddedDate)}</span>
                  </div>
                  <div className="text-sm whitespace-pre-wrap">{c.Comments}</div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Activity Log */}
        <div className="lg:col-span-2">
          <ActivityLogPanel entries={activityLogs} />
        </div>
      </div>
    </main>
  )
}
