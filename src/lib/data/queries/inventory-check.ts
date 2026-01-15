/**
 * Inventory Check Module
 * 
 * Provides stock level checking for shipment creation.
 * Used to warn users when shipping more than available stock.
 */

import { prisma } from '@/lib/prisma'

export interface StockLevel {
  sku: string
  availableQty: number
  committedQty: number
  onHandQty: number
}

export interface StockCheckResult {
  sku: string
  requestedQty: number
  availableQty: number
  hasWarning: boolean
  message: string | null
}

/**
 * Get stock levels for multiple SKUs
 * Note: The Sku table only has Quantity field - no separate committed/available tracking
 */
export async function getStockLevels(skus: string[]): Promise<Map<string, StockLevel>> {
  if (skus.length === 0) return new Map()

  const inventory = await prisma.sku.findMany({
    where: {
      SkuID: { in: skus },
    },
    select: {
      SkuID: true,
      Quantity: true,
    },
  })

  const stockMap = new Map<string, StockLevel>()
  for (const item of inventory) {
    const qty = item.Quantity ?? 0
    stockMap.set(item.SkuID, {
      sku: item.SkuID,
      availableQty: qty,
      committedQty: 0, // No separate committed tracking in current schema
      onHandQty: qty,
    })
  }

  return stockMap
}

/**
 * Check stock availability for items being shipped
 */
export async function checkStockForShipment(
  items: Array<{ sku: string; quantity: number }>
): Promise<StockCheckResult[]> {
  const skus = items.map((i) => i.sku)
  const stockLevels = await getStockLevels(skus)

  return items.map((item) => {
    const stock = stockLevels.get(item.sku)
    if (!stock) {
      return {
        sku: item.sku,
        requestedQty: item.quantity,
        availableQty: 0,
        hasWarning: true,
        message: 'SKU not found in inventory',
      }
    }

    const hasWarning = item.quantity > stock.availableQty
    let message: string | null = null

    if (item.quantity > stock.availableQty) {
      if (stock.availableQty <= 0) {
        message = `Out of stock (${stock.availableQty} available)`
      } else {
        message = `Low stock: only ${stock.availableQty} available, shipping ${item.quantity}`
      }
    }

    return {
      sku: item.sku,
      requestedQty: item.quantity,
      availableQty: stock.availableQty,
      hasWarning,
      message,
    }
  })
}

/**
 * Get a summary of stock warnings for a shipment
 */
export async function getStockWarnings(
  items: Array<{ sku: string; quantity: number }>
): Promise<{ hasWarnings: boolean; warnings: StockCheckResult[] }> {
  const results = await checkStockForShipment(items)
  const warnings = results.filter((r) => r.hasWarning)
  return {
    hasWarnings: warnings.length > 0,
    warnings,
  }
}
