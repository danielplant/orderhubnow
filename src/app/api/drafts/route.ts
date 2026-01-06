import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * Generate next draft order number with D prefix.
 * Uses same pattern as order numbers but with 'D' prefix.
 */
async function getNextDraftNumber(): Promise<string> {
  const prefix = 'D'
  const defaultStart = 10001

  const lastDraft = await prisma.customerOrders.findFirst({
    where: { OrderNumber: { startsWith: prefix } },
    orderBy: { ID: 'desc' },
    select: { OrderNumber: true },
  })

  if (!lastDraft?.OrderNumber) {
    return `${prefix}${defaultStart}`
  }

  const lastNumber = parseInt(lastDraft.OrderNumber.replace(prefix, ''), 10)
  return `${prefix}${lastNumber + 1}`
}

/**
 * POST /api/drafts - Create a new draft order
 * 
 * No authentication required - drafts are public/shareable.
 * Returns the draft ID (order number) for shareable links.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    
    // Generate draft number
    const draftNumber = await getNextDraftNumber()
    
    // Create minimal draft order
    const draft = await prisma.customerOrders.create({
      data: {
        OrderNumber: draftNumber,
        OrderStatus: 'Draft',
        // Default placeholder values (will be updated via PUT)
        BuyerName: '',
        StoreName: '',
        SalesRep: '',
        CustomerEmail: '',
        CustomerPhone: '',
        Country: body.currency || 'CAD',
        OrderAmount: 0,
        OrderNotes: '',
        CustomerPO: '',
        ShipStartDate: new Date(),
        ShipEndDate: new Date(),
        OrderDate: new Date(),
        Website: '',
        IsShipped: false,
        IsTransferredToShopify: false,
      },
      select: {
        ID: true,
        OrderNumber: true,
      },
    })

    return NextResponse.json({
      id: draftNumber,
      dbId: String(draft.ID),
    })
  } catch (error) {
    console.error('Create draft error:', error)
    return NextResponse.json(
      { error: 'Failed to create draft' },
      { status: 500 }
    )
  }
}
