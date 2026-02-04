import { NextResponse } from 'next/server'
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
  samples: Record<string, PreviewRow[]>
}

/**
 * Get sample SKUs for each scenario to preview display rules
 */
export async function GET() {
  const session = await auth()
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Get sample SKUs from each collection type
    const skus = await prisma.sku.findMany({
      where: {
        Collection: { isNot: null },
      },
      include: {
        Collection: {
          select: {
            name: true,
            type: true,
          },
        },
      },
      orderBy: { ID: 'desc' },
      take: 300,
    })

    // Get incoming data for these SKUs
    const skuIds = skus.map((s) => s.SkuID)
    
    const incomingData = await prisma.$queryRawUnsafe<
      Array<{ skuId: string; incoming: number | null; committed: number | null }>
    >(`
      SELECT r.SkuID AS skuId,
             inv.Incoming AS incoming,
             inv.CommittedQuantity AS committed
      FROM RawSkusFromShopify r
      LEFT JOIN RawSkusInventoryLevelFromShopify inv ON r.InventoryItemId = inv.ParentId
      WHERE r.SkuID IN (${skuIds.map(() => '?').join(',')})
    `, ...skuIds)

    const incomingMap = new Map<string, { incoming: number | null; committed: number | null }>()
    for (const row of incomingData) {
      incomingMap.set(row.skuId, { incoming: row.incoming, committed: row.committed })
    }

    // Group by scenario
    const samples: Record<string, PreviewRow[]> = {
      ats: [],
      preorder_po: [],
      preorder_no_po: [],
    }

    for (const sku of skus) {
      const collectionType = sku.Collection?.type
      const incomingEntry = incomingMap.get(sku.SkuID)

      const row: PreviewRow = {
        skuId: sku.SkuID,
        description: sku.OrderEntryDescription ?? sku.Description ?? sku.SkuID,
        collectionName: sku.Collection?.name ?? null,
        collectionType: collectionType ?? null,
        quantity: sku.Quantity ?? 0,
        onRoute: sku.OnRoute ?? 0,
        incoming: incomingEntry?.incoming ?? null,
        committed: incomingEntry?.committed ?? null,
      }

      // Map collection type to scenario
      let scenario: string
      if (collectionType === 'ats') {
        scenario = 'ats'
      } else if (collectionType === 'preorder_po') {
        scenario = 'preorder_po'
      } else if (collectionType === 'preorder_no_po') {
        scenario = 'preorder_no_po'
      } else {
        // Default to ATS for unknown types
        scenario = 'ats'
      }

      if (samples[scenario].length < 5) {
        samples[scenario].push(row)
      }
    }

    const response: PreviewResponse = { samples }
    return NextResponse.json(response)
  } catch (err) {
    console.error('Error fetching preview samples:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch preview samples' },
      { status: 500 }
    )
  }
}
