import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/providers'
import { prisma } from '@/lib/prisma'
import { getIncomingMapForSkus } from '@/lib/data/queries/availability-settings'
import { getAvailabilityScenario } from '@/lib/availability/compute'

type ScenarioKey = 'ats' | 'preorder_incoming' | 'preorder_no_incoming'

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

export async function GET() {
  const session = await auth()
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rows = await prisma.sku.findMany({
    where: {
      Collection: {
        type: { in: ['ATS', 'PreOrder'] },
      },
    },
    orderBy: { DateModified: 'desc' },
    take: 200,
    select: {
      SkuID: true,
      Description: true,
      OrderEntryDescription: true,
      Quantity: true,
      OnRoute: true,
      Collection: {
        select: {
          name: true,
          type: true,
        },
      },
    },
  })

  const skuIds = rows.map((row) => row.SkuID)
  const incomingMap = await getIncomingMapForSkus(skuIds)

  const samples: Record<ScenarioKey, PreviewRow[]> = {
    ats: [],
    preorder_incoming: [],
    preorder_no_incoming: [],
  }

  for (const row of rows) {
    const incomingEntry = incomingMap.get(row.SkuID)
    const incoming = incomingEntry?.incoming ?? null
    const committed = incomingEntry?.committed ?? null
    const scenario = getAvailabilityScenario(row.Collection?.type ?? null)
    if (samples[scenario].length >= 5) continue

    samples[scenario].push({
      skuId: row.SkuID,
      description: row.OrderEntryDescription ?? row.Description ?? row.SkuID,
      collectionName: row.Collection?.name ?? null,
      collectionType: row.Collection?.type ?? null,
      quantity: row.Quantity ?? 0,
      onRoute: row.OnRoute ?? 0,
      incoming,
      committed,
    })
  }

  return NextResponse.json({
    samples,
  })
}
