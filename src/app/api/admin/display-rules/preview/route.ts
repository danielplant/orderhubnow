import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { auth } from '@/lib/auth/providers'
import { prisma } from '@/lib/prisma'

interface PreviewRow {
  skuId: string
  description: string
  collectionName: string | null
  collectionType: string | null
  quantity: number
  onRoute: number
  incoming: number | null
  committed: number | null
}

interface PreviewResponse {
  sku: PreviewRow | null
  scenario: string | null
  message?: string
}

/**
 * Map collection type to scenario, including legacy values
 */
function mapCollectionTypeToScenario(type: string | null | undefined): string {
  if (type === 'ats' || type === 'ATS') return 'ats'
  if (type === 'preorder_po') return 'preorder_po'
  if (type === 'preorder_no_po' || type === 'PreOrder') return 'preorder_no_po'
  return 'ats' // fallback
}

/**
 * Get a single SKU by exact match for preview display rules
 * Query param: ?sku=SKU_ID (exact match)
 */
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const skuParam = request.nextUrl.searchParams.get('sku')

  // If no SKU provided, return empty with hint
  if (!skuParam || skuParam.trim() === '') {
    const response: PreviewResponse = {
      sku: null,
      scenario: null,
      message: 'Enter a SKU ID to preview display rules.',
    }
    return NextResponse.json(response)
  }

  const skuId = skuParam.trim()

  try {
    // Exact match lookup
    const sku = await prisma.sku.findFirst({
      where: {
        SkuID: skuId,
      },
      include: {
        Collection: {
          select: {
            name: true,
            type: true,
          },
        },
      },
    })

    if (!sku) {
      const response: PreviewResponse = {
        sku: null,
        scenario: null,
        message: `No SKU found with ID "${skuId}".`,
      }
      return NextResponse.json(response)
    }

    // Get incoming data for this SKU
    const incomingData = await prisma.$queryRaw<
      Array<{ skuId: string; incoming: number | null; committed: number | null }>
    >(Prisma.sql`
      SELECT r.SkuID AS skuId,
             inv.Incoming AS incoming,
             inv.CommittedQuantity AS committed
      FROM RawSkusFromShopify r
      LEFT JOIN RawSkusInventoryLevelFromShopify inv ON r.InventoryItemId = inv.ParentId
      WHERE r.SkuID = ${skuId}
    `)

    const incomingEntry = incomingData[0]

    const collectionType = sku.Collection?.type ?? null
    const scenario = mapCollectionTypeToScenario(collectionType)

    const row: PreviewRow = {
      skuId: sku.SkuID,
      description: sku.OrderEntryDescription ?? sku.Description ?? sku.SkuID,
      collectionName: sku.Collection?.name ?? null,
      collectionType: collectionType,
      quantity: sku.Quantity ?? 0,
      onRoute: sku.OnRoute ?? 0,
      incoming: incomingEntry?.incoming ?? null,
      committed: incomingEntry?.committed ?? null,
    }

    const response: PreviewResponse = {
      sku: row,
      scenario,
    }
    return NextResponse.json(response)
  } catch (err) {
    console.error('Error fetching preview SKU:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch preview SKU' },
      { status: 500 }
    )
  }
}
