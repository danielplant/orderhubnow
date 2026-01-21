#!/usr/bin/env npx tsx
/**
 * Backfill Script: Fix IsPreOrder for existing orders
 * 
 * This script re-derives the IsPreOrder flag for all CustomerOrders from the 
 * underlying SKU data (SkuCategories.IsPreOrder).
 * 
 * Run: npx tsx scripts/backfill-order-type.ts
 * 
 * Flags:
 *   --dry-run    Show what would be changed without making changes
 *   --verbose    Show detailed output for each order
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

interface BackfillResult {
  orderId: bigint
  orderNumber: string
  currentIsPreOrder: boolean | null
  derivedIsPreOrder: boolean
  skuCount: number
  preOrderSkuCount: number
  action: 'update' | 'skip' | 'error'
  error?: string
}

async function deriveIsPreOrderFromOrderItems(orderId: bigint): Promise<{
  isPreOrder: boolean
  skuCount: number
  preOrderSkuCount: number
}> {
  // Get all SKU variant IDs for this order
  const items = await prisma.customerOrdersItems.findMany({
    where: { CustomerOrderID: orderId },
    select: { SKUVariantID: true },
  })

  if (items.length === 0) {
    // No items - default to false (ATS)
    return { isPreOrder: false, skuCount: 0, preOrderSkuCount: 0 }
  }

  const skuVariantIds = items.map((i) => i.SKUVariantID)

  // Query SKUs with their category IsPreOrder flag
  const skus = await prisma.sku.findMany({
    where: { ID: { in: skuVariantIds } },
    select: {
      ID: true,
      SkuCategories: {
        select: { IsPreOrder: true },
      },
    },
  })

  // Count pre-order SKUs
  const preOrderSkuCount = skus.filter((s) => s.SkuCategories?.IsPreOrder === true).length

  // If ANY SKU is pre-order, the order should be pre-order
  // (This handles mixed orders - they should have been split)
  const isPreOrder = preOrderSkuCount > 0

  return {
    isPreOrder,
    skuCount: items.length,
    preOrderSkuCount,
  }
}

async function backfillOrderType(dryRun: boolean, verbose: boolean): Promise<void> {
  console.log('='.repeat(60))
  console.log('Backfill Order Type Script')
  console.log('='.repeat(60))
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE (will update)'}`)
  console.log('')

  // Get all non-draft orders
  const orders = await prisma.customerOrders.findMany({
    where: {
      OrderStatus: { not: 'Draft' },
    },
    select: {
      ID: true,
      OrderNumber: true,
      IsPreOrder: true,
    },
    orderBy: { ID: 'asc' },
  })

  console.log(`Found ${orders.length} non-draft orders to process`)
  console.log('')

  const results: BackfillResult[] = []
  let updateCount = 0
  let skipCount = 0
  let errorCount = 0

  for (const order of orders) {
    try {
      const { isPreOrder, skuCount, preOrderSkuCount } = await deriveIsPreOrderFromOrderItems(order.ID)

      const needsUpdate = order.IsPreOrder !== isPreOrder

      if (needsUpdate) {
        if (!dryRun) {
          await prisma.customerOrders.update({
            where: { ID: order.ID },
            data: { IsPreOrder: isPreOrder },
          })
        }
        updateCount++

        if (verbose) {
          console.log(
            `[UPDATE] ${order.OrderNumber}: ${order.IsPreOrder} -> ${isPreOrder} ` +
              `(${preOrderSkuCount}/${skuCount} pre-order SKUs)`
          )
        }

        results.push({
          orderId: order.ID,
          orderNumber: order.OrderNumber,
          currentIsPreOrder: order.IsPreOrder,
          derivedIsPreOrder: isPreOrder,
          skuCount,
          preOrderSkuCount,
          action: 'update',
        })
      } else {
        skipCount++

        if (verbose) {
          console.log(`[SKIP] ${order.OrderNumber}: already ${isPreOrder}`)
        }

        results.push({
          orderId: order.ID,
          orderNumber: order.OrderNumber,
          currentIsPreOrder: order.IsPreOrder,
          derivedIsPreOrder: isPreOrder,
          skuCount,
          preOrderSkuCount,
          action: 'skip',
        })
      }
    } catch (error) {
      errorCount++
      const message = error instanceof Error ? error.message : String(error)

      console.error(`[ERROR] ${order.OrderNumber}: ${message}`)

      results.push({
        orderId: order.ID,
        orderNumber: order.OrderNumber,
        currentIsPreOrder: order.IsPreOrder,
        derivedIsPreOrder: false,
        skuCount: 0,
        preOrderSkuCount: 0,
        action: 'error',
        error: message,
      })
    }
  }

  console.log('')
  console.log('='.repeat(60))
  console.log('Summary')
  console.log('='.repeat(60))
  console.log(`Total orders processed: ${orders.length}`)
  console.log(`  Updated: ${updateCount}`)
  console.log(`  Skipped (no change needed): ${skipCount}`)
  console.log(`  Errors: ${errorCount}`)
  console.log('')

  if (dryRun && updateCount > 0) {
    console.log('This was a dry run. Run without --dry-run to apply changes.')
  }

  // Show sample of updates
  const updates = results.filter((r) => r.action === 'update')
  if (updates.length > 0 && !verbose) {
    console.log('')
    console.log('Sample of updates (first 10):')
    for (const r of updates.slice(0, 10)) {
      console.log(
        `  ${r.orderNumber}: ${r.currentIsPreOrder} -> ${r.derivedIsPreOrder} ` +
          `(${r.preOrderSkuCount}/${r.skuCount} pre-order SKUs)`
      )
    }
    if (updates.length > 10) {
      console.log(`  ... and ${updates.length - 10} more`)
    }
  }
}

// Parse CLI args
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const verbose = args.includes('--verbose')

backfillOrderType(dryRun, verbose)
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
