// Settings types - matches InventorySettings table (Prisma model)
// Scoped to fields used by InventorySettings.aspx.cs

/**
 * Fields editable via the Settings page.
 * Matches .NET btnUpdate_Click behavior.
 */
export type InventorySettingsEditableFields = {
  MinQuantityToShow: number
  AllowMultipleImages: boolean
  EnableZoom: boolean
  ShowShopifyImages: boolean
  USDToCADConversion: number
}

/**
 * Full record from InventorySettings table.
 * Single-row table.
 */
export type InventorySettingsRecord = InventorySettingsEditableFields & {
  ID: number

  // Present in DB, but not edited on InventorySettings.aspx:
  CanadaPassword: string
  USAPassword: string
  CanadaUSAPassword: string | null
  ImageRefreshCounter: number
}

/**
 * Standard action result for server actions.
 */
export type ActionResult =
  | { success: true; message?: string }
  | { success: false; error: string }
