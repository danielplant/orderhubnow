import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendOrderEmails } from '@/lib/email/send-order-emails'
import { deriveShipmentsFromItems, findShipmentIdForSku } from '@/lib/data/actions/orders'
import { validateShipDates } from '@/lib/validation/ship-window'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * Generate next order number with A (ATS) or P (Pre-Order) prefix.
 * Replicates logic from orders.ts for draft submission.
 */
async function getNextOrderNumber(isPreOrder: boolean): Promise<string> {
  const prefix = isPreOrder ? 'P' : 'A'
  const defaultStart = 10001

  try {
    const result = await prisma.$queryRaw<[{ OrderNumber: string }]>`
      DECLARE @OrderNumber NVARCHAR(50);
      EXEC [dbo].[uspGetNextOrderNumber] @Prefix = ${prefix}, @OrderNumber = @OrderNumber OUTPUT;
      SELECT @OrderNumber AS OrderNumber;
    `
    if (result?.[0]?.OrderNumber) {
      return result[0].OrderNumber
    }
  } catch {
    // SP not available, use fallback
  }

  // Fallback
  const lastOrder = await prisma.customerOrders.findFirst({
    where: { OrderNumber: { startsWith: prefix } },
    orderBy: { ID: 'desc' },
    select: { OrderNumber: true },
  })

  if (!lastOrder?.OrderNumber) {
    return `${prefix}${defaultStart}`
  }

  const lastNumber = parseInt(lastOrder.OrderNumber.replace(prefix, ''), 10)
  return `${prefix}${lastNumber + 1}`
}

/**
 * Derive order type (ATS vs Pre-Order) from SKU data.
 * Master source: Collection.type
 */
async function deriveIsPreOrderFromSkus(
  skuVariantIds: bigint[]
): Promise<Map<string, boolean>> {
  if (skuVariantIds.length === 0) {
    return new Map()
  }

  const skus = await prisma.sku.findMany({
    where: { ID: { in: skuVariantIds } },
    select: {
      ID: true,
      CollectionID: true,
      Collection: {
        select: { type: true },
      },
    },
  })

  const result = new Map<string, boolean>()
  for (const sku of skus) {
    // Use Collection.type to determine pre-order status
    const isPreOrder = sku.Collection?.type === 'PreOrder'
    result.set(String(sku.ID), isPreOrder)
  }

  return result
}

// Phase 9: getOrderGroupKey removed - now using planned shipments instead of order splitting

/**
 * POST /api/drafts/[id]/submit - Convert draft to real order
 * 
 * No authentication required - drafts are public/shareable.
 * 
 * This:
 * 1. Validates the draft has required fields
 * 2. Generates a real order number (A or P prefix)
 * 3. Creates CustomerOrdersItems from cart state
 * 4. Changes status from Draft to Pending
 * 5. Sends confirmation emails
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))

    // Get draft
    const draft = await prisma.customerOrders.findFirst({
      where: {
        OrderNumber: id,
        OrderStatus: 'Draft',
      },
    })

    if (!draft) {
      return NextResponse.json(
        { error: 'Draft not found' },
        { status: 404 }
      )
    }

    // Parse draft state
    let state: {
      orders: Record<string, Record<string, number>>
      prices: Record<string, number>
      preOrderMeta: Record<string, unknown>
      lineMeta: Record<string, unknown>
      formData?: Record<string, string>
    }

    try {
      state = JSON.parse(draft.OrderNotes || '{}')
    } catch {
      return NextResponse.json(
        { error: 'Invalid draft state' },
        { status: 400 }
      )
    }

    // Merge body formData with stored formData (body takes precedence)
    const formData = {
      ...state.formData,
      ...body.formData,
    }

    // Validate required fields
    const required = [
      'storeName', 'buyerName', 'customerEmail', 'customerPhone',
      'salesRepId', 'street1', 'city', 'stateProvince', 'zipPostal', 'country',
      'shippingStreet1', 'shippingCity', 'shippingStateProvince', 'shippingZipPostal', 'shippingCountry',
      'shipStartDate', 'shipEndDate',
    ]

    const missing = required.filter(f => !formData[f])
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missing.join(', ')}` },
        { status: 400 }
      )
    }

    // Validate cart has items
    const hasItems = Object.values(state.orders || {}).some(
      skuQtys => Object.values(skuQtys).some(qty => qty > 0)
    )
    if (!hasItems) {
      return NextResponse.json(
        { error: 'Cart is empty' },
        { status: 400 }
      )
    }

    // NOTE: Order type will be derived from SKU data below, not preOrderMeta

    // Look up rep name and email
    const rep = await prisma.reps.findUnique({
      where: { ID: parseInt(formData.salesRepId) },
      select: { Name: true, Email1: true, Email2: true },
    })
    const salesRepName = rep?.Name || 'Unknown Rep'
    const salesRepEmail = rep?.Email1 || rep?.Email2 || undefined

    // Gap 3 Fix: Customer lookup (upsert happens inside transaction for parity with createOrder)
    let customerId: number | null = null
    const existingCustomer = await prisma.customers.findFirst({
      where: { StoreName: formData.storeName },
      select: { ID: true, OrderCount: true },
    })
    if (existingCustomer) {
      customerId = existingCustomer.ID
    }

    // Calculate order amount
    let orderAmount = 0
    for (const [, skuQtys] of Object.entries(state.orders)) {
      for (const [sku, qty] of Object.entries(skuQtys as Record<string, number>)) {
        const price = state.prices[sku] || 0
        orderAmount += price * qty
      }
    }

    // Build items for database with Collection ship window metadata
    const items: Array<{
      sku: string
      skuVariantId: bigint
      quantity: number
      price: number
      collectionId: number | null
      collectionName: string | null
      shipWindowStart: string | null
      shipWindowEnd: string | null
    }> = []

    // Look up SKU data including Collection (source of truth)
    const allSkus = Object.values(state.orders).flatMap(skuQtys => Object.keys(skuQtys))
    const skuRecords = await prisma.sku.findMany({
      where: { SkuID: { in: allSkus } },
      select: {
        ID: true,
        SkuID: true,
        CollectionID: true,
        Collection: {
          select: {
            name: true,
            type: true,
            shipWindowStart: true,
            shipWindowEnd: true,
          },
        },
      },
    })
    const skuDataMap = new Map(skuRecords.map(s => [s.SkuID, s]))
    
    // Build pre-order map from Collection.type
    const skuPreOrderMap = new Map<string, boolean>()
    for (const sku of skuRecords) {
      skuPreOrderMap.set(String(sku.ID), sku.Collection?.type === 'PreOrder')
    }

    for (const [, skuQtys] of Object.entries(state.orders)) {
      for (const [sku, qty] of Object.entries(skuQtys as Record<string, number>)) {
        if (qty > 0) {
          const skuData = skuDataMap.get(sku)
          items.push({
            sku,
            skuVariantId: BigInt(skuData?.ID || 0),
            quantity: qty,
            price: state.prices[sku] || 0,
            collectionId: skuData?.CollectionID ?? null,
            collectionName: skuData?.Collection?.name ?? null,
            shipWindowStart: skuData?.Collection?.shipWindowStart?.toISOString() ?? null,
            shipWindowEnd: skuData?.Collection?.shipWindowEnd?.toISOString() ?? null,
          })
        }
      }
    }

    // Phase 9: Use planned shipments instead of splitting orders
    const plannedShipments = deriveShipmentsFromItems(
      items.map(i => ({
        sku: i.sku,
        skuVariantId: String(i.skuVariantId),
        quantity: i.quantity,
        price: i.price,
        collectionId: i.collectionId,
        collectionName: i.collectionName,
        shipWindowStart: i.shipWindowStart,
        shipWindowEnd: i.shipWindowEnd,
      })),
      {
        shipStartDate: formData.shipStartDate,
        shipEndDate: formData.shipEndDate,
      }
    )

    // Validate ship dates against collection windows
    const collectionIds = plannedShipments
      .map((s) => s.collectionId)
      .filter((id): id is number => id !== null)

    if (collectionIds.length > 0) {
      const collections = await prisma.collection.findMany({
        where: { id: { in: collectionIds } },
        select: { id: true, name: true, shipWindowStart: true, shipWindowEnd: true },
      })
      const collectionMap = new Map(collections.map((c) => [c.id, c]))

      for (const shipment of plannedShipments) {
        if (shipment.collectionId) {
          const collection = collectionMap.get(shipment.collectionId)
          if (collection?.shipWindowStart && collection?.shipWindowEnd) {
            const normalizeDate = (d: Date | string): string => {
              const date = typeof d === 'string' ? new Date(d) : d
              return date.toISOString().split('T')[0]
            }

            const result = validateShipDates(
              normalizeDate(shipment.plannedShipStart),
              normalizeDate(shipment.plannedShipEnd),
              [{
                id: shipment.collectionId,
                name: collection.name,
                shipWindowStart: normalizeDate(collection.shipWindowStart),
                shipWindowEnd: normalizeDate(collection.shipWindowEnd),
              }]
            )
            if (!result.valid) {
              return NextResponse.json(
                { error: `Invalid dates for ${collection.name}: ${result.errors[0]?.message}` },
                { status: 400 }
              )
            }
          }
        }
      }
    }

    // Determine order type (any PreOrder item makes it a PreOrder)
    const hasPreOrderItems = [...skuPreOrderMap.values()].some((v) => v)
    const orderNumber = await getNextOrderNumber(hasPreOrderItems)

    // Calculate legacy dates from all shipments
    const allStarts = plannedShipments.map((s) => new Date(s.plannedShipStart))
    const allEnds = plannedShipments.map((s) => new Date(s.plannedShipEnd))
    const shipStart = allStarts.length ? new Date(Math.min(...allStarts.map(d => d.getTime()))) : new Date(formData.shipStartDate)
    const shipEnd = allEnds.length ? new Date(Math.max(...allEnds.map(d => d.getTime()))) : new Date(formData.shipEndDate)

    const currency = formData.currency || 'CAD'
    let createdOrder: { ID: bigint; OrderNumber: string } | null = null

    await prisma.$transaction(async (tx) => {
      // Delete the draft first
      await tx.customerOrdersItems.deleteMany({
        where: { CustomerOrderID: draft.ID },
      })
      await tx.customerOrders.delete({
        where: { ID: draft.ID },
      })

      // Create SINGLE order
      const newOrder = await tx.customerOrders.create({
        data: {
          OrderNumber: orderNumber,
          OrderStatus: 'Pending',
          BuyerName: formData.buyerName,
          StoreName: formData.storeName,
          SalesRep: salesRepName,
          CustomerEmail: formData.customerEmail,
          CustomerPhone: formData.customerPhone,
          Country: currency,
          OrderAmount: orderAmount,
          OrderNotes: formData.orderNotes || '',
          CustomerPO: formData.customerPO || '',
          ShipStartDate: shipStart,
          ShipEndDate: shipEnd,
          OrderDate: new Date(),
          Website: formData.website || '',
          IsShipped: false,
          IsTransferredToShopify: false,
          IsPreOrder: hasPreOrderItems,
          RepID: parseInt(formData.salesRepId),
          CustomerID: customerId,
        },
      })
      createdOrder = { ID: newOrder.ID, OrderNumber: orderNumber }

      // Create planned shipments
      const shipmentIdMap = new Map<string, bigint>()
      for (const shipment of plannedShipments) {
        const created = await tx.plannedShipment.create({
          data: {
            CustomerOrderID: newOrder.ID,
            CollectionID: shipment.collectionId,
            CollectionName: shipment.collectionName,
            PlannedShipStart: new Date(shipment.plannedShipStart),
            PlannedShipEnd: new Date(shipment.plannedShipEnd),
            Status: 'Planned',
          },
        })
        shipmentIdMap.set(shipment.id, created.ID)
      }

      // Create order items with PlannedShipmentID
      for (const item of items) {
        const plannedShipmentId = findShipmentIdForSku(
          item.sku,
          plannedShipments.map(s => ({
            ...s,
            itemSkus: s.itemSkus || [],
          })),
          shipmentIdMap
        )

        await tx.customerOrdersItems.create({
          data: {
            CustomerOrderID: newOrder.ID,
            OrderNumber: orderNumber,
            SKU: item.sku,
            SKUVariantID: item.skuVariantId,
            Quantity: item.quantity,
            Price: item.price,
            PriceCurrency: currency,
            PlannedShipmentID: plannedShipmentId,
            Notes: '',
          },
        })
      }

      // =========================================================================
      // Gap 3 Fix: Customer upsert/create for parity with createOrder
      // =========================================================================
      if (existingCustomer) {
        // Update existing customer with latest info and increment OrderCount
        await tx.customers.update({
          where: { ID: existingCustomer.ID },
          data: {
            CustomerName: formData.buyerName,
            Email: formData.customerEmail,
            Phone: formData.customerPhone,
            Rep: salesRepCode,
            Street1: formData.street1 ?? '',
            Street2: formData.street2 ?? '',
            City: formData.city ?? '',
            StateProvince: formData.stateProvince ?? '',
            PostalCode: formData.zipPostal ?? '',
            Country: formData.country ?? 'USA',
            ShippingStreet1: formData.shippingStreet1 ?? formData.street1 ?? '',
            ShippingStreet2: formData.shippingStreet2 ?? formData.street2 ?? '',
            ShippingCity: formData.shippingCity ?? formData.city ?? '',
            ShippingStateProvince: formData.shippingStateProvince ?? formData.stateProvince ?? '',
            ShippingPostalCode: formData.shippingZipPostal ?? formData.zipPostal ?? '',
            ShippingCountry: formData.shippingCountry ?? formData.country ?? 'USA',
            Website: formData.website ?? '',
            LastOrderDate: new Date(),
            OrderCount: (existingCustomer.OrderCount ?? 0) + 1,
          },
        })
      } else {
        // Create new customer and update order with CustomerID
        const newCustomer = await tx.customers.create({
          data: {
            StoreName: formData.storeName,
            CustomerName: formData.buyerName,
            Email: formData.customerEmail,
            Phone: formData.customerPhone,
            Rep: salesRepCode,
            Street1: formData.street1 ?? '',
            Street2: formData.street2 ?? '',
            City: formData.city ?? '',
            StateProvince: formData.stateProvince ?? '',
            PostalCode: formData.zipPostal ?? '',
            Country: formData.country ?? 'USA',
            ShippingStreet1: formData.shippingStreet1 ?? formData.street1 ?? '',
            ShippingStreet2: formData.shippingStreet2 ?? formData.street2 ?? '',
            ShippingCity: formData.shippingCity ?? formData.city ?? '',
            ShippingStateProvince: formData.shippingStateProvince ?? formData.stateProvince ?? '',
            ShippingPostalCode: formData.shippingZipPostal ?? formData.zipPostal ?? '',
            ShippingCountry: formData.shippingCountry ?? formData.country ?? 'USA',
            Website: formData.website ?? '',
            FirstOrderDate: new Date(),
            LastOrderDate: new Date(),
            OrderCount: 1,
          },
          select: { ID: true },
        })

        // Update order with new customer's ID
        await tx.customerOrders.update({
          where: { ID: newOrder.ID },
          data: { CustomerID: newCustomer.ID },
        })
      }
    })

    if (!createdOrder) {
      return NextResponse.json({ error: 'Failed to create order' }, { status: 500 })
    }

    // Send confirmation email for the single order
    void sendOrderEmails({
      orderId: String(createdOrder.ID),
      orderNumber: createdOrder.OrderNumber,
      storeName: formData.storeName,
      buyerName: formData.buyerName,
      customerEmail: formData.customerEmail,
      customerPhone: formData.customerPhone,
      salesRep: salesRepName,
      salesRepEmail: rep?.Email1 ?? undefined,
      orderAmount: orderAmount,
      currency: currency as 'USD' | 'CAD',
      shipStartDate: shipStart,
      shipEndDate: shipEnd,
      orderDate: new Date(),
      orderNotes: formData.orderNotes,
      customerPO: formData.customerPO,
      items: items.map((item) => ({
        sku: item.sku,
        quantity: item.quantity,
        price: item.price,
        lineTotal: item.price * item.quantity,
      })),
    })

    // Return with backward compatibility
    return NextResponse.json({
      success: true,
      orderId: String(createdOrder.ID),
      orderNumber: createdOrder.OrderNumber,
      orderAmount: orderAmount,
      plannedShipmentCount: plannedShipments.length,
      // Gap 4 Fix: Use MIN/MAX dates for backward compatibility (not first shipment)
      orders: [{
        orderId: String(createdOrder.ID),
        orderNumber: createdOrder.OrderNumber,
        orderAmount: orderAmount,
        collectionName: plannedShipments[0]?.collectionName ?? null,
        shipWindowStart: shipStart.toISOString().split('T')[0],
        shipWindowEnd: shipEnd.toISOString().split('T')[0],
      }],
    })
  } catch (error) {
    console.error('Submit draft error:', error)
    return NextResponse.json(
      { error: 'Failed to submit order' },
      { status: 500 }
    )
  }
}
