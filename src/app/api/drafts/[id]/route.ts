import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * Draft state stored in OrderNotes as JSON (cart + form data).
 * This avoids schema changes while storing all draft state.
 */
interface DraftState {
  // Cart items
  orders: Record<string, Record<string, number>> // productId -> { sku: qty }
  prices: Record<string, number> // sku -> price
  preOrderMeta: Record<string, {
    categoryId: number
    categoryName: string
    onRouteStart: string | null
    onRouteEnd: string | null
  }>
  lineMeta: Record<string, { isOnRoute: boolean }>
  
  // Form fields (partial - user may not have filled everything)
  formData?: {
    storeName?: string
    buyerName?: string
    customerEmail?: string
    customerPhone?: string
    salesRepId?: string
    currency?: string
    billingAddress?: string
    billingCity?: string
    billingState?: string
    billingZip?: string
    billingCountry?: string
    shippingAddress?: string
    shippingCity?: string
    shippingState?: string
    shippingZip?: string
    shippingCountry?: string
    shipStartDate?: string
    shipEndDate?: string
    customerPO?: string
    orderNotes?: string
    website?: string
  }
  
  // Shipment date overrides (Phase 2 - Planned Shipments)
  // Maps shipment ID to user-customized dates
  shipmentDateOverrides?: Record<string, { start: string; end: string }>
  
  // Metadata
  lastUpdated: string
}

/**
 * GET /api/drafts/[id] - Get draft by ID
 * 
 * No authentication required - drafts are public/shareable.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params

    const draft = await prisma.customerOrders.findFirst({
      where: {
        OrderNumber: id,
        OrderStatus: 'Draft',
      },
      select: {
        ID: true,
        OrderNumber: true,
        OrderNotes: true,
        OrderDate: true,
        Country: true,
      },
    })

    if (!draft) {
      return NextResponse.json(
        { error: 'Draft not found' },
        { status: 404 }
      )
    }

    // Parse draft state from OrderNotes
    let state: DraftState | null = null
    try {
      if (draft.OrderNotes) {
        state = JSON.parse(draft.OrderNotes)
      }
    } catch {
      // Invalid JSON, return empty state
    }

    return NextResponse.json({
      id: draft.OrderNumber,
      dbId: String(draft.ID),
      currency: draft.Country || 'CAD',
      createdAt: draft.OrderDate?.toISOString(),
      state: state || {
        orders: {},
        prices: {},
        preOrderMeta: {},
        lineMeta: {},
        formData: {},
        lastUpdated: new Date().toISOString(),
      },
    })
  } catch (error) {
    console.error('Get draft error:', error)
    return NextResponse.json(
      { error: 'Failed to get draft' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/drafts/[id] - Update draft (auto-save)
 * 
 * No authentication required - drafts are public/shareable.
 * Stores entire cart + form state in OrderNotes as JSON.
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const body = await request.json()

    // Verify draft exists
    const existing = await prisma.customerOrders.findFirst({
      where: {
        OrderNumber: id,
        OrderStatus: 'Draft',
      },
      select: { ID: true },
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'Draft not found' },
        { status: 404 }
      )
    }

    // Build draft state
    const state: DraftState = {
      orders: body.orders || {},
      prices: body.prices || {},
      preOrderMeta: body.preOrderMeta || {},
      lineMeta: body.lineMeta || {},
      formData: body.formData || {},
      shipmentDateOverrides: body.shipmentDateOverrides || {},
      lastUpdated: new Date().toISOString(),
    }

    // Calculate total from prices and quantities
    let orderAmount = 0
    for (const [, skuQtys] of Object.entries(state.orders)) {
      for (const [sku, qty] of Object.entries(skuQtys as Record<string, number>)) {
        const price = state.prices[sku] || 0
        orderAmount += price * qty
      }
    }

    // Update draft
    await prisma.customerOrders.update({
      where: { ID: existing.ID },
      data: {
        OrderNotes: JSON.stringify(state),
        OrderAmount: orderAmount,
        Country: body.formData?.currency || body.currency || 'CAD',
        // Update header fields if provided
        ...(body.formData?.storeName && { StoreName: body.formData.storeName }),
        ...(body.formData?.buyerName && { BuyerName: body.formData.buyerName }),
        ...(body.formData?.customerEmail && { CustomerEmail: body.formData.customerEmail }),
        ...(body.formData?.customerPhone && { CustomerPhone: body.formData.customerPhone }),
      },
    })

    return NextResponse.json({
      success: true,
      id,
      lastUpdated: state.lastUpdated,
    })
  } catch (error) {
    console.error('Update draft error:', error)
    return NextResponse.json(
      { error: 'Failed to update draft' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/drafts/[id] - Delete draft
 * 
 * No authentication required.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params

    const draft = await prisma.customerOrders.findFirst({
      where: {
        OrderNumber: id,
        OrderStatus: 'Draft',
      },
      select: { ID: true },
    })

    if (!draft) {
      return NextResponse.json(
        { error: 'Draft not found' },
        { status: 404 }
      )
    }

    // Delete any items first (foreign key constraint)
    await prisma.customerOrdersItems.deleteMany({
      where: { CustomerOrderID: draft.ID },
    })

    // Delete draft
    await prisma.customerOrders.delete({
      where: { ID: draft.ID },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete draft error:', error)
    return NextResponse.json(
      { error: 'Failed to delete draft' },
      { status: 500 }
    )
  }
}
