/**
 * Open Items / Backorder Queries
 * ============================================================================
 * Queries for tracking unfulfilled order items (open items).
 */

import { prisma } from '@/lib/prisma'

// ============================================================================
// Types
// ============================================================================

export interface OpenItem {
  orderItemId: string
  orderId: string
  orderNumber: string
  orderDate: Date
  storeName: string
  sku: string
  orderedQty: number
  shippedQty: number
  cancelledQty: number
  openQty: number
  unitPrice: number
  openValue: number
  lineItemStatus: string | null
  daysOpen: number
}

export interface OpenItemsSummary {
  totalOpenItems: number
  totalOpenUnits: number
  totalOpenValue: number
  totalOrders: number
}

export interface OpenItemsResult {
  items: OpenItem[]
  summary: OpenItemsSummary
}

export interface OpenItemsBySkuRow {
  sku: string
  totalOpenQty: number
  totalOpenValue: number
  orderCount: number
  avgDaysOpen: number
}

// ============================================================================
// Queries
// ============================================================================

/**
 * Get all open (unfulfilled) items across orders.
 * An item is "open" if: ordered - shipped - cancelled > 0
 */
export async function getOpenItems(options?: {
  limit?: number
  offset?: number
  sortBy?: 'orderDate' | 'sku' | 'openQty' | 'openValue' | 'daysOpen'
  sortDir?: 'asc' | 'desc'
  searchQuery?: string
}): Promise<OpenItemsResult> {
  const {
    limit = 100,
    offset = 0,
    sortBy = 'orderDate',
    sortDir = 'desc',
    searchQuery,
  } = options ?? {}

  // Get all order items with shipment aggregates
  const orderItems = await prisma.customerOrdersItems.findMany({
    where: {
      CustomerOrders: {
        OrderStatus: {
          notIn: ['Draft', 'Cancelled', 'Invoiced'],
        },
      },
      // Filter by SKU if search query provided
      ...(searchQuery ? { SKU: { contains: searchQuery } } : {}),
    },
    select: {
      ID: true,
      SKU: true,
      Quantity: true,
      Price: true,
      Status: true,
      CancelledQty: true,
      CustomerOrders: {
        select: {
          ID: true,
          OrderNumber: true,
          OrderDate: true,
          StoreName: true,
        },
      },
    },
  })

  // Get shipment items for these order items
  const itemIds = orderItems.map(item => item.ID)
  const shipmentItems = await prisma.shipmentItems.findMany({
    where: { OrderItemID: { in: itemIds } },
    select: {
      OrderItemID: true,
      QuantityShipped: true,
    },
  })

  // Build shipped quantity map
  const shippedByItem = new Map<string, number>()
  for (const si of shipmentItems) {
    const key = si.OrderItemID.toString()
    shippedByItem.set(key, (shippedByItem.get(key) ?? 0) + si.QuantityShipped)
  }

  // Process items to calculate open quantities
  const openItems: OpenItem[] = []
  const now = new Date()

  for (const item of orderItems) {
    const shippedQty = shippedByItem.get(item.ID.toString()) ?? 0
    const cancelledQty = item.CancelledQty ?? 0
    const openQty = item.Quantity - shippedQty - cancelledQty

    // Only include items with open quantity
    if (openQty > 0) {
      const orderDate = item.CustomerOrders.OrderDate ?? new Date()
      const daysOpen = Math.floor((now.getTime() - orderDate.getTime()) / (1000 * 60 * 60 * 24))

      openItems.push({
        orderItemId: item.ID.toString(),
        orderId: item.CustomerOrders.ID.toString(),
        orderNumber: item.CustomerOrders.OrderNumber ?? '',
        orderDate,
        storeName: item.CustomerOrders.StoreName ?? '',
        sku: item.SKU ?? '',
        orderedQty: item.Quantity,
        shippedQty,
        cancelledQty,
        openQty,
        unitPrice: item.Price ?? 0,
        openValue: openQty * (item.Price ?? 0),
        lineItemStatus: item.Status,
        daysOpen,
      })
    }
  }

  // Sort items
  openItems.sort((a, b) => {
    let cmp = 0
    switch (sortBy) {
      case 'orderDate':
        cmp = a.orderDate.getTime() - b.orderDate.getTime()
        break
      case 'sku':
        cmp = a.sku.localeCompare(b.sku)
        break
      case 'openQty':
        cmp = a.openQty - b.openQty
        break
      case 'openValue':
        cmp = a.openValue - b.openValue
        break
      case 'daysOpen':
        cmp = a.daysOpen - b.daysOpen
        break
    }
    return sortDir === 'desc' ? -cmp : cmp
  })

  // Calculate summary
  const uniqueOrders = new Set(openItems.map(i => i.orderId))
  const summary: OpenItemsSummary = {
    totalOpenItems: openItems.length,
    totalOpenUnits: openItems.reduce((sum, i) => sum + i.openQty, 0),
    totalOpenValue: openItems.reduce((sum, i) => sum + i.openValue, 0),
    totalOrders: uniqueOrders.size,
  }

  // Apply pagination
  const paginatedItems = openItems.slice(offset, offset + limit)

  return {
    items: paginatedItems,
    summary,
  }
}

/**
 * Get open items grouped by SKU.
 */
export async function getOpenItemsBySku(): Promise<OpenItemsBySkuRow[]> {
  const { items } = await getOpenItems({ limit: 10000 })

  // Group by SKU
  const bySkuMap = new Map<string, {
    totalOpenQty: number
    totalOpenValue: number
    orderIds: Set<string>
    totalDaysOpen: number
    count: number
  }>()

  for (const item of items) {
    const existing = bySkuMap.get(item.sku) ?? {
      totalOpenQty: 0,
      totalOpenValue: 0,
      orderIds: new Set<string>(),
      totalDaysOpen: 0,
      count: 0,
    }

    existing.totalOpenQty += item.openQty
    existing.totalOpenValue += item.openValue
    existing.orderIds.add(item.orderId)
    existing.totalDaysOpen += item.daysOpen
    existing.count += 1

    bySkuMap.set(item.sku, existing)
  }

  // Convert to array
  const result: OpenItemsBySkuRow[] = []
  for (const [sku, data] of bySkuMap) {
    result.push({
      sku,
      totalOpenQty: data.totalOpenQty,
      totalOpenValue: data.totalOpenValue,
      orderCount: data.orderIds.size,
      avgDaysOpen: Math.round(data.totalDaysOpen / data.count),
    })
  }

  // Sort by total open value descending
  result.sort((a, b) => b.totalOpenValue - a.totalOpenValue)

  return result
}

/**
 * Get open items summary for dashboard widget.
 */
export async function getOpenItemsSummary(): Promise<OpenItemsSummary> {
  const { summary } = await getOpenItems({ limit: 1 })
  return summary
}
