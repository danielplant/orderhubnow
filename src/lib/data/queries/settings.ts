import { prisma } from '@/lib/prisma'
import type { InventorySettingsRecord } from '@/lib/types/settings'

/**
 * Fetch the single InventorySettings row.
 * Mirrors .NET Page_Load in InventorySettings.aspx.cs.
 */
export async function getInventorySettings(): Promise<InventorySettingsRecord> {
  const row = await prisma.inventorySettings.findFirst()

  if (!row) {
    // Mirrors .NET "not found" behavior (shows error label)
    throw new Error('Inventory settings not found in the database')
  }

  return {
    ID: row.ID,
    MinQuantityToShow: row.MinQuantityToShow,
    AllowMultipleImages: row.AllowMultipleImages ?? false,
    EnableZoom: row.EnableZoom ?? false,
    ShowShopifyImages: row.ShowShopifyImages ?? false,
    USDToCADConversion: row.USDToCADConversion ?? 0,

    CanadaPassword: row.CanadaPassword,
    USAPassword: row.USAPassword,
    CanadaUSAPassword: row.CanadaUSAPassword ?? null,
    ImageRefreshCounter: row.ImageRefreshCounter,
  }
}
