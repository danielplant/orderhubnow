/**
 * Integration test: Validate a real pending order against Shopify
 * This is READ-ONLY - no orders will be created or modified
 */

import { prisma } from '../src/lib/prisma'
import { findShopifyVariant, findCachedShopifyCustomer } from '../src/lib/data/queries/shopify'

async function main() {
  console.log('='.repeat(60))
  console.log('SHOPIFY ORDER VALIDATION - INTEGRATION TEST (READ-ONLY)')
  console.log('='.repeat(60))
  console.log('')

  console.log('Finding pending orders not transferred to Shopify...\n')
  
  // Get a few pending orders
  const pendingOrders = await prisma.customerOrders.findMany({
    where: {
      IsTransferredToShopify: { not: true },
    },
    orderBy: { OrderDate: 'desc' },
    take: 5,
    select: {
      ID: true,
      OrderNumber: true,
      StoreName: true,
      OrderAmount: true,
      CustomerEmail: true,
      OrderDate: true,
    },
  })

  if (pendingOrders.length === 0) {
    console.log('No pending orders found!')
    await prisma.$disconnect()
    return
  }

  console.log('Pending orders available:')
  pendingOrders.forEach((o, i) => {
    console.log(`  ${i + 1}. ${o.OrderNumber} | ${o.StoreName} | $${o.OrderAmount.toFixed(2)} | ${o.OrderDate.toISOString().slice(0, 10)}`)
  })

  // Pick the first one to validate
  const order = pendingOrders[0]
  console.log('')
  console.log('='.repeat(60))
  console.log(`VALIDATING ORDER: ${order.OrderNumber}`)
  console.log('='.repeat(60))
  console.log('')

  // Get order items
  const orderItems = await prisma.customerOrdersItems.findMany({
    where: { CustomerOrderID: order.ID },
    select: {
      SKU: true,
      SKUVariantID: true,
      Quantity: true,
      Price: true,
    },
  })

  console.log(`Order: ${order.OrderNumber}`)
  console.log(`Store: ${order.StoreName}`)
  console.log(`Amount: $${order.OrderAmount.toFixed(2)}`)
  console.log(`Items: ${orderItems.length}`)
  console.log('')

  // Check customer
  console.log('--- CUSTOMER CHECK ---')
  let customerExists = false
  if (order.CustomerEmail) {
    const cached = await findCachedShopifyCustomer(order.CustomerEmail)
    customerExists = !!cached
    console.log(`Email: ${order.CustomerEmail}`)
    console.log(`Status: ${customerExists ? '✓ EXISTS in Shopify cache' : '⚠ NOT in cache (will be auto-created on transfer)'}`)
  } else {
    console.log('Email: (none)')
    console.log('Status: ⚠ No email - customer creation may fail')
  }
  console.log('')

  // Check each SKU
  console.log('--- SKU VALIDATION ---')
  const missingSkus: string[] = []
  const inventoryStatus: Array<{ sku: string; ordered: number; available: number; status: string }> = []

  for (const item of orderItems) {
    const variant = await findShopifyVariant(
      item.SKUVariantID > 0 ? item.SKUVariantID : null,
      item.SKU
    )

    if (!variant || !variant.shopifyId) {
      missingSkus.push(item.SKU)
      console.log(`❌ ${item.SKU.padEnd(25)} | MISSING - Not found in Shopify`)
      continue
    }

    // Check inventory
    const localSku = await prisma.sku.findFirst({
      where: { SkuID: variant.skuId },
      select: { Quantity: true },
    })

    const available = localSku?.Quantity ?? 0
    const ordered = item.Quantity
    let status = 'ok'
    if (available === 0) status = 'backorder'
    else if (available < ordered) status = 'partial'

    inventoryStatus.push({ sku: variant.skuId, ordered, available, status })
    
    const statusIcon = status === 'ok' ? '✓' : '⚠'
    const statusLabel = status === 'ok' ? 'OK' : status === 'partial' ? 'PARTIAL' : 'BACKORDER'
    console.log(`${statusIcon} ${variant.skuId.padEnd(25)} | Ordered: ${String(ordered).padStart(3)} | Avail: ${String(available).padStart(4)} | ${statusLabel}`)
  }

  // Summary
  console.log('')
  console.log('='.repeat(60))
  console.log('VALIDATION RESULT')
  console.log('='.repeat(60))
  
  const valid = missingSkus.length === 0
  const okCount = inventoryStatus.filter(i => i.status === 'ok').length
  const partialCount = inventoryStatus.filter(i => i.status === 'partial').length
  const backorderCount = inventoryStatus.filter(i => i.status === 'backorder').length

  console.log('')
  console.log(`Can Transfer: ${valid ? 'YES ✓' : 'NO ✗'}`)
  console.log('')
  console.log(`SKUs in Shopify:    ${inventoryStatus.length}/${orderItems.length}`)
  console.log(`Missing SKUs:       ${missingSkus.length}`)
  console.log(`Inventory OK:       ${okCount}`)
  console.log(`Inventory Partial:  ${partialCount}`)
  console.log(`Inventory Backorder:${backorderCount}`)
  console.log('')

  if (valid) {
    console.log('✅ This order CAN be transferred to Shopify')
    if (partialCount > 0 || backorderCount > 0) {
      console.log('   (Some items have inventory warnings - will need partial shipments)')
    }
  } else {
    console.log('❌ This order CANNOT be transferred')
    console.log('')
    console.log('Missing SKUs that must be added to Shopify first:')
    missingSkus.forEach(sku => console.log(`   - ${sku}`))
  }

  console.log('')
  console.log('='.repeat(60))

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error('Error:', e)
  await prisma.$disconnect()
  process.exit(1)
})
