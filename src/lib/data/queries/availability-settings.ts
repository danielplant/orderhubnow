import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type {
  AvailabilityMatrix,
  AvailabilitySettingsRecord,
} from '@/lib/types/availability-settings'
import {
  DEFAULT_SETTINGS,
  normalizeAvailabilityMatrix,
  normalizeAvailabilitySettings,
} from '@/lib/availability/settings'

export interface AvailabilitySettingsWithMeta {
  settings: AvailabilitySettingsRecord
  updatedAt?: Date | null
  updatedBy?: string | null
}

export async function getAvailabilitySettingsWithMeta(): Promise<AvailabilitySettingsWithMeta> {
  const existing = await prisma.availabilitySettings.findFirst()

  if (!existing) {
    return { settings: DEFAULT_SETTINGS }
  }

  let matrix: AvailabilityMatrix = DEFAULT_SETTINGS.matrix
  try {
    matrix = normalizeAvailabilityMatrix(JSON.parse(existing.matrixConfig))
  } catch {
    matrix = DEFAULT_SETTINGS.matrix
  }

  return {
    settings: normalizeAvailabilitySettings({
      matrix,
      showOnRouteProducts: existing.showOnRouteProducts,
      showOnRouteInventory: existing.showOnRouteInventory,
      showOnRouteXlsx: existing.showOnRouteXlsx,
      showOnRoutePdf: existing.showOnRoutePdf,
      onRouteLabelProducts: existing.onRouteLabelProducts,
      onRouteLabelInventory: existing.onRouteLabelInventory,
      onRouteLabelXlsx: existing.onRouteLabelXlsx,
      onRouteLabelPdf: existing.onRouteLabelPdf,
      legendText: existing.legendText,
      showLegendAts: existing.showLegendAts,
      showLegendPreorderIncoming: existing.showLegendPreorderIncoming,
      showLegendPreorderNoIncoming: existing.showLegendPreorderNoIncoming,
    }),
    updatedAt: existing.updatedAt,
    updatedBy: existing.updatedBy,
  }
}

export async function getAvailabilitySettings(): Promise<AvailabilitySettingsRecord> {
  const { settings } = await getAvailabilitySettingsWithMeta()
  return settings
}

export interface IncomingMapEntry {
  incoming: number | null
  committed: number | null
}

export async function getIncomingMapForSkus(
  skuIds: string[]
): Promise<Map<string, IncomingMapEntry>> {
  const map = new Map<string, IncomingMapEntry>()
  if (skuIds.length === 0) return map

  const rows = await prisma.$queryRaw<
    Array<{ skuId: string; incoming: number | null; committed: number | null }>
  >(Prisma.sql`
    SELECT r.SkuID AS skuId,
           inv.Incoming AS incoming,
           inv.CommittedQuantity AS committed
    FROM RawSkusFromShopify r
    LEFT JOIN RawSkusInventoryLevelFromShopify inv ON r.InventoryItemId = inv.ParentId
    WHERE r.SkuID IN (${Prisma.join(skuIds)})
  `)

  for (const row of rows) {
    const existing = map.get(row.skuId)
    if (!existing || (existing.incoming == null && row.incoming != null)) {
      map.set(row.skuId, { incoming: row.incoming, committed: row.committed })
    }
  }

  return map
}
