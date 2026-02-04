import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * Cron endpoint to permanently delete orders that have been in trash for > 30 days.
 *
 * This endpoint should be called daily to:
 * - Delete orders where TrashedAt < 30 days ago
 * - Clean up related records (items, comments, shipments)
 * - Free up database storage
 *
 * Security: Requires CRON_SECRET in production.
 *
 * Example cron setup:
 *   0 2 * * * curl -X POST https://yourdomain.com/api/cron/trash-cleanup -H "Authorization: Bearer $CRON_SECRET"
 */
export async function POST(request: Request) {
  // Check for cron secret in production
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startTime = Date.now()

  try {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    // Find orders to delete
    const ordersToDelete = await prisma.customerOrders.findMany({
      where: { TrashedAt: { lt: thirtyDaysAgo } },
      select: { ID: true, OrderNumber: true, TrashedAt: true },
    })

    let deleted = 0
    const deletedOrders: string[] = []

    for (const order of ordersToDelete) {
      try {
        // Delete related records first (no cascade in schema)
        await prisma.customerOrdersItems.deleteMany({ 
          where: { CustomerOrderID: order.ID } 
        })
        await prisma.customerOrdersComments.deleteMany({ 
          where: { OrderID: order.ID } 
        })
        
        // Delete shipment items before shipments
        await prisma.shipmentItems.deleteMany({
          where: { Shipment: { CustomerOrderID: order.ID } }
        })
        await prisma.shipments.deleteMany({ 
          where: { CustomerOrderID: order.ID } 
        })
        
        // PlannedShipments (has cascade from FK but let's be explicit)
        await prisma.plannedShipment.deleteMany({
          where: { CustomerOrderID: order.ID }
        })
        
        // Finally delete the order
        await prisma.customerOrders.delete({ 
          where: { ID: order.ID } 
        })
        
        deleted++
        deletedOrders.push(order.OrderNumber)
      } catch (err) {
        console.error(`[trash-cleanup] Failed to delete order ${order.OrderNumber}:`, err)
        // Continue with other orders
      }
    }

    // Structured logging for monitoring
    console.log(
      JSON.stringify({
        event: 'cron_trash_cleanup',
        timestamp: new Date().toISOString(),
        found: ordersToDelete.length,
        deleted,
        deletedOrders: deletedOrders.slice(0, 20), // Log first 20 for reference
        durationMs: Date.now() - startTime,
      })
    )

    return NextResponse.json({
      success: true,
      found: ordersToDelete.length,
      deleted,
      durationMs: Date.now() - startTime,
    })
  } catch (err) {
    console.error('[trash-cleanup] Cron error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Cleanup failed' },
      { status: 500 }
    )
  }
}

// Also support GET for easy manual testing
export async function GET(request: Request) {
  return POST(request)
}
