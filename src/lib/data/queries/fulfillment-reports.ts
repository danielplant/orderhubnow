/**
 * Fulfillment Reports Module
 * 
 * Provides analytics and reporting for shipment/fulfillment operations:
 * - Fulfillment rates and metrics
 * - Shipping volume by carrier
 * - Open items summary
 * - Cancellation analysis
 */

import { prisma } from '@/lib/prisma'

// ============================================================================
// Types
// ============================================================================

export interface FulfillmentMetrics {
  totalOrders: number
  ordersShipped: number
  ordersPartiallyShipped: number
  ordersPending: number
  fulfillmentRate: number // percentage
  totalUnitsOrdered: number
  totalUnitsShipped: number
  totalUnitsCancelled: number
  unitsShipRate: number // percentage
  averageShipmentsPerOrder: number
}

export interface ShippingVolumeByCarrier {
  carrier: string
  shipments: number
  packages: number
  percentage: number
}

export interface CancellationSummary {
  totalCancelled: number
  cancellationRate: number // percentage of ordered
  byReason: { reason: string; count: number; percentage: number }[]
  byMonth: { month: string; count: number }[]
}

export interface OpenItemsSummary {
  totalOpenItems: number
  totalOpenUnits: number
  totalOpenValue: number
  oldestOpenDate: Date | null
  averageDaysOpen: number
  byStatus: { status: string; count: number; units: number }[]
}

export interface DateRange {
  from: Date
  to: Date
}

// ============================================================================
// Query Functions
// ============================================================================

/**
 * Get fulfillment metrics for a date range
 */
export async function getFulfillmentMetrics(
  dateRange?: DateRange
): Promise<FulfillmentMetrics> {
  const where = buildDateFilter(dateRange)

  // Get order counts by status
  const orderCounts = await prisma.customerOrders.groupBy({
    by: ['OrderStatus'],
    where: {
      ...where,
      OrderStatus: { notIn: ['Cancelled'] },
    },
    _count: { ID: true },
  })

  const totalOrders = orderCounts.reduce((sum, g) => sum + g._count.ID, 0)
  const ordersShipped = orderCounts.find((g) => g.OrderStatus === 'Shipped')?._count.ID || 0
  const ordersPartiallyShipped = orderCounts.find((g) => g.OrderStatus === 'Partially Shipped')?._count.ID || 0
  const ordersInvoiced = orderCounts.find((g) => g.OrderStatus === 'Invoiced')?._count.ID || 0
  const ordersPending = totalOrders - ordersShipped - ordersPartiallyShipped - ordersInvoiced

  // Get line item totals
  const lineItemStats = await prisma.customerOrdersItems.aggregate({
    where: {
      CustomerOrders: where,
    },
    _sum: {
      Quantity: true,
      CancelledQty: true,
    },
  })

  const totalUnitsOrdered = lineItemStats._sum.Quantity || 0
  const totalUnitsCancelled = lineItemStats._sum.CancelledQty || 0

  // Get shipped units
  const shipmentItemStats = await prisma.shipmentItems.aggregate({
    where: {
      Shipment: {
        CustomerOrders: where,
      },
    },
    _sum: {
      QuantityShipped: true,
    },
  })

  const totalUnitsShipped = shipmentItemStats._sum.QuantityShipped || 0

  // Get shipment count per order
  const shipmentCounts = await prisma.shipments.groupBy({
    by: ['CustomerOrderID'],
    where: {
      CustomerOrders: where,
    },
    _count: { ID: true },
  })

  const averageShipmentsPerOrder = shipmentCounts.length > 0
    ? shipmentCounts.reduce((sum, g) => sum + g._count.ID, 0) / shipmentCounts.length
    : 0

  const fulfillmentRate = totalOrders > 0
    ? ((ordersShipped + ordersInvoiced) / totalOrders) * 100
    : 0

  const unitsShipRate = totalUnitsOrdered > 0
    ? (totalUnitsShipped / totalUnitsOrdered) * 100
    : 0

  return {
    totalOrders,
    ordersShipped: ordersShipped + ordersInvoiced,
    ordersPartiallyShipped,
    ordersPending,
    fulfillmentRate: Math.round(fulfillmentRate * 10) / 10,
    totalUnitsOrdered,
    totalUnitsShipped,
    totalUnitsCancelled,
    unitsShipRate: Math.round(unitsShipRate * 10) / 10,
    averageShipmentsPerOrder: Math.round(averageShipmentsPerOrder * 10) / 10,
  }
}

/**
 * Get shipping volume breakdown by carrier
 */
export async function getShippingVolumeByCarrier(
  dateRange?: DateRange
): Promise<ShippingVolumeByCarrier[]> {
  const carrierStats = await prisma.shipmentTracking.groupBy({
    by: ['Carrier'],
    where: {
      Shipment: {
        CustomerOrders: buildDateFilter(dateRange),
      },
    },
    _count: { ID: true },
  })

  const total = carrierStats.reduce((sum, g) => sum + g._count.ID, 0)

  return carrierStats
    .map((g) => ({
      carrier: g.Carrier || 'Unknown',
      shipments: g._count.ID,
      packages: g._count.ID, // One tracking per shipment typically
      percentage: total > 0 ? Math.round((g._count.ID / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.shipments - a.shipments)
}

/**
 * Get cancellation summary and analysis
 */
export async function getCancellationSummary(
  dateRange?: DateRange
): Promise<CancellationSummary> {
  // Get total ordered units
  const totalOrdered = await prisma.customerOrdersItems.aggregate({
    where: {
      CustomerOrders: buildDateFilter(dateRange),
    },
    _sum: { Quantity: true },
  })

  // Get cancelled items with reasons
  const cancelledItems = await prisma.customerOrdersItems.findMany({
    where: {
      CancelledQty: { gt: 0 },
      CustomerOrders: buildDateFilter(dateRange),
    },
    select: {
      CancelledQty: true,
      CancelledReason: true,
      CancelledAt: true,
    },
  })

  const totalCancelled = cancelledItems.reduce((sum, item) => sum + (item.CancelledQty || 0), 0)
  const totalUnits = totalOrdered._sum.Quantity || 0
  const cancellationRate = totalUnits > 0
    ? Math.round((totalCancelled / totalUnits) * 1000) / 10
    : 0

  // Group by reason
  const reasonCounts = new Map<string, number>()
  for (const item of cancelledItems) {
    const reason = item.CancelledReason || 'No reason provided'
    reasonCounts.set(reason, (reasonCounts.get(reason) || 0) + (item.CancelledQty || 0))
  }

  const byReason = Array.from(reasonCounts.entries())
    .map(([reason, count]) => ({
      reason,
      count,
      percentage: totalCancelled > 0 ? Math.round((count / totalCancelled) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.count - a.count)

  // Group by month
  const monthCounts = new Map<string, number>()
  for (const item of cancelledItems) {
    if (item.CancelledAt) {
      const month = item.CancelledAt.toISOString().slice(0, 7) // YYYY-MM
      monthCounts.set(month, (monthCounts.get(month) || 0) + (item.CancelledQty || 0))
    }
  }

  const byMonth = Array.from(monthCounts.entries())
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => a.month.localeCompare(b.month))

  return {
    totalCancelled,
    cancellationRate,
    byReason,
    byMonth,
  }
}

/**
 * Get open items summary
 */
export async function getOpenItemsSummary(): Promise<OpenItemsSummary> {
  // Get all items with open quantities
  const items = await prisma.customerOrdersItems.findMany({
    where: {
      CustomerOrders: {
        OrderStatus: { notIn: ['Cancelled', 'Invoiced'] },
      },
    },
    select: {
      ID: true,
      Quantity: true,
      Price: true,
      CancelledQty: true,
      Status: true,
      CustomerOrders: {
        select: {
          OrderDate: true,
        },
      },
    },
  })

  // Get shipped quantities per item
  const shipmentItems = await prisma.shipmentItems.findMany({
    select: {
      OrderItemID: true,
      QuantityShipped: true,
    },
  })

  const shippedByItem = new Map<string, number>()
  for (const si of shipmentItems) {
    const key = si.OrderItemID.toString()
    shippedByItem.set(key, (shippedByItem.get(key) || 0) + si.QuantityShipped)
  }

  let totalOpenItems = 0
  let totalOpenUnits = 0
  let totalOpenValue = 0
  let oldestOpenDate: Date | null = null
  let totalDaysOpen = 0
  const statusCounts = new Map<string, { count: number; units: number }>()

  for (const item of items) {
    const shipped = shippedByItem.get(item.ID.toString()) || 0
    const cancelled = item.CancelledQty || 0
    const remaining = item.Quantity - shipped - cancelled

    if (remaining > 0) {
      totalOpenItems++
      totalOpenUnits += remaining
      totalOpenValue += remaining * item.Price

      const orderDate = item.CustomerOrders.OrderDate
      if (!oldestOpenDate || orderDate < oldestOpenDate) {
        oldestOpenDate = orderDate
      }

      const daysOpen = Math.floor(
        (Date.now() - orderDate.getTime()) / (1000 * 60 * 60 * 24)
      )
      totalDaysOpen += daysOpen

      const status = item.Status || 'Open'
      const current = statusCounts.get(status) || { count: 0, units: 0 }
      statusCounts.set(status, { count: current.count + 1, units: current.units + remaining })
    }
  }

  const byStatus = Array.from(statusCounts.entries())
    .map(([status, data]) => ({ status, count: data.count, units: data.units }))
    .sort((a, b) => b.units - a.units)

  return {
    totalOpenItems,
    totalOpenUnits,
    totalOpenValue: Math.round(totalOpenValue * 100) / 100,
    oldestOpenDate,
    averageDaysOpen: totalOpenItems > 0 ? Math.round(totalDaysOpen / totalOpenItems) : 0,
    byStatus,
  }
}

/**
 * Get daily shipment volume for charting
 */
export async function getDailyShipmentVolume(
  dateRange: DateRange
): Promise<{ date: string; count: number; units: number }[]> {
  const shipments = await prisma.shipments.findMany({
    where: {
      ShipDate: {
        gte: dateRange.from,
        lte: dateRange.to,
      },
    },
    select: {
      ShipDate: true,
      ShipmentItems: {
        select: {
          QuantityShipped: true,
        },
      },
    },
  })

  const dailyData = new Map<string, { count: number; units: number }>()

  for (const shipment of shipments) {
    if (shipment.ShipDate) {
      const date = shipment.ShipDate.toISOString().slice(0, 10)
      const current = dailyData.get(date) || { count: 0, units: 0 }
      const units = shipment.ShipmentItems.reduce((sum, item) => sum + item.QuantityShipped, 0)
      dailyData.set(date, { count: current.count + 1, units: current.units + units })
    }
  }

  return Array.from(dailyData.entries())
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

// ============================================================================
// Helpers
// ============================================================================

function buildDateFilter(dateRange?: DateRange) {
  if (!dateRange) return {}
  return {
    OrderDate: {
      gte: dateRange.from,
      lte: dateRange.to,
    },
  }
}
