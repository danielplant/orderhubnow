import { prisma } from '@/lib/prisma'
import type {
  InventorySettingsRecord,
  CompanySettingsRecord,
  EmailSettingsRecord,
  SyncSettingsRecord,
  SyncSettingsHistoryRecord,
  SizeOrderConfigRecord,
} from '@/lib/types/settings'
import { SYNC_SETTINGS_DEFAULTS } from '@/lib/types/settings'
import { DEFAULT_SIZE_ORDER } from '@/lib/utils/size-sort'

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

/**
 * Default company settings (used when no record exists).
 */
const DEFAULT_COMPANY_SETTINGS: CompanySettingsRecord = {
  ID: 0,
  CompanyName: 'limeapple',
  AddressLine1: '31 COUNTRY LANE TERRACE',
  AddressLine2: 'CALGARY, AB CANADA T3Z 1H8',
  Phone: '1 800 359 5171',
  Fax: '1 888 226 7189',
  Email: 'sales@limeapple.com',
  Website: 'www.limeapple.com',
  LogoUrl: '/logos/limeapple-logo.png',
}

/**
 * Fetch company settings for PDF generation.
 * Returns default limeapple settings if no record exists.
 */
export async function getCompanySettings(): Promise<CompanySettingsRecord> {
  const row = await prisma.companySettings.findFirst()

  if (!row) {
    return DEFAULT_COMPANY_SETTINGS
  }

  return {
    ID: row.ID,
    CompanyName: row.CompanyName,
    AddressLine1: row.AddressLine1,
    AddressLine2: row.AddressLine2,
    Phone: row.Phone,
    Fax: row.Fax,
    Email: row.Email,
    Website: row.Website,
    LogoUrl: row.LogoUrl,
  }
}

/**
 * Create or update company settings.
 */
export async function upsertCompanySettings(
  data: Omit<CompanySettingsRecord, 'ID'>
): Promise<CompanySettingsRecord> {
  const existing = await prisma.companySettings.findFirst()

  if (existing) {
    const updated = await prisma.companySettings.update({
      where: { ID: existing.ID },
      data,
    })
    return {
      ID: updated.ID,
      CompanyName: updated.CompanyName,
      AddressLine1: updated.AddressLine1,
      AddressLine2: updated.AddressLine2,
      Phone: updated.Phone,
      Fax: updated.Fax,
      Email: updated.Email,
      Website: updated.Website,
      LogoUrl: updated.LogoUrl,
    }
  }

  const created = await prisma.companySettings.create({ data })
  return {
    ID: created.ID,
    CompanyName: created.CompanyName,
    AddressLine1: created.AddressLine1,
    AddressLine2: created.AddressLine2,
    Phone: created.Phone,
    Fax: created.Fax,
    Email: created.Email,
    Website: created.Website,
    LogoUrl: created.LogoUrl,
  }
}

/**
 * Default email settings (used when no record exists).
 * All settings must be configured via Admin UI.
 */
const DEFAULT_EMAIL_SETTINGS: EmailSettingsRecord = {
  ID: 0,
  FromEmail: null,
  FromName: null,
  SalesTeamEmails: null,
  CCEmails: null,
  // Order toggles
  NotifyOnNewOrder: true,
  NotifyOnOrderUpdate: false,
  SendCustomerConfirmation: true,
  SendRepOrderCopy: true,
  // Shipment toggles
  SendShipmentConfirmation: true,
  SendShipmentRepNotify: true,
  SendTrackingUpdates: true,
  AttachInvoicePdf: true,
  AttachPackingSlipPdf: true,
  UpdatedAt: new Date(),
  SmtpHost: null,
  SmtpPort: null,
  SmtpUser: null,
  SmtpPassword: null,
  SmtpSecure: false,
}

/**
 * Fetch email notification settings.
 * Returns defaults if no record exists.
 * All settings come from database only (configured via Admin UI).
 */
export async function getEmailSettings(): Promise<EmailSettingsRecord> {
  const row = await prisma.emailSettings.findFirst()

  if (!row) {
    return DEFAULT_EMAIL_SETTINGS
  }

  return {
    ID: row.ID,
    FromEmail: row.FromEmail,
    FromName: row.FromName,
    SalesTeamEmails: row.SalesTeamEmails,
    CCEmails: row.CCEmails,
    // Order toggles
    NotifyOnNewOrder: row.NotifyOnNewOrder,
    NotifyOnOrderUpdate: row.NotifyOnOrderUpdate,
    SendCustomerConfirmation: row.SendCustomerConfirmation,
    SendRepOrderCopy: row.SendRepOrderCopy ?? true,
    // Shipment toggles
    SendShipmentConfirmation: row.SendShipmentConfirmation ?? true,
    SendShipmentRepNotify: row.SendShipmentRepNotify ?? true,
    SendTrackingUpdates: row.SendTrackingUpdates ?? true,
    AttachInvoicePdf: row.AttachInvoicePdf ?? true,
    AttachPackingSlipPdf: row.AttachPackingSlipPdf ?? true,
    UpdatedAt: row.UpdatedAt,
    SmtpHost: row.SmtpHost,
    SmtpPort: row.SmtpPort,
    SmtpUser: row.SmtpUser,
    SmtpPassword: row.SmtpPassword,
    SmtpSecure: row.SmtpSecure ?? false,
  }
}

// ============================================================================
// Sync Settings (Shopify sync, thumbnails, backups)
// ============================================================================

/**
 * Get sync settings with fallback to defaults.
 * Always returns a value - creates defaults if no record exists.
 */
export async function getSyncSettings(): Promise<SyncSettingsRecord> {
  const existing = await prisma.syncSettings.findFirst()

  if (existing) {
    return existing
  }

  // Return default values (not persisted until first update)
  return {
    id: 0,
    version: 0,
    ...SYNC_SETTINGS_DEFAULTS,
    updatedAt: new Date(),
  }
}

/**
 * Get sync settings history for audit trail.
 * Returns most recent changes first.
 */
export async function getSyncSettingsHistory(
  limit: number = 20
): Promise<SyncSettingsHistoryRecord[]> {
  return prisma.syncSettingsHistory.findMany({
    orderBy: { changedAt: 'desc' },
    take: limit,
  })
}

/**
 * Get a specific historical version of settings.
 */
export async function getSyncSettingsVersion(
  version: number
): Promise<SyncSettingsHistoryRecord | null> {
  return prisma.syncSettingsHistory.findFirst({
    where: { version },
  })
}

// ============================================================================
// Size Order Configuration
// ============================================================================

/**
 * Fetch size order configuration.
 * Returns default size order if no config exists in database.
 */
export async function getSizeOrderConfig(): Promise<SizeOrderConfigRecord> {
  const row = await prisma.sizeOrderConfig.findFirst()

  if (!row) {
    return {
      ID: 0,
      Sizes: DEFAULT_SIZE_ORDER,
      ValidatedSizes: DEFAULT_SIZE_ORDER, // All default sizes are validated
      UpdatedAt: new Date(),
      UpdatedBy: null,
    }
  }

  const sizes = JSON.parse(row.Sizes) as string[]
  // Backward compat: if ValidatedSizes is NULL, treat all existing sizes as validated
  const validatedSizes = row.ValidatedSizes
    ? (JSON.parse(row.ValidatedSizes) as string[])
    : sizes

  return {
    ID: row.ID,
    Sizes: sizes,
    ValidatedSizes: validatedSizes,
    UpdatedAt: row.UpdatedAt,
    UpdatedBy: row.UpdatedBy,
  }
}

/**
 * Get distinct sizes from SKU table with counts.
 * Used by the Size Order admin UI to show unmapped sizes from Shopify.
 */
export async function getDistinctSizes(): Promise<{ size: string; count: number }[]> {
  const result = await prisma.$queryRaw<{ size: string; count: bigint }[]>`
    SELECT Size as size, COUNT(*) as count
    FROM Sku
    WHERE Size IS NOT NULL AND Size != ''
    GROUP BY Size
    ORDER BY count DESC
  `
  // Convert BigInt count to number
  return result.map(r => ({ size: r.size, count: Number(r.count) }))
}

/**
 * Item returned by getMissingSizeVariants().
 * Includes both product and variant IDs for building Shopify admin links.
 */
export interface MissingSizeItem {
  skuId: string
  shopifyProductId: string | null  // GID format: gid://shopify/Product/123
  shopifyVariantId: string | null  // Numeric string (BigInt converted)
  description: string | null
}

/**
 * Get SKUs that have missing (NULL or empty) size field.
 * Returns variant-level data with both ShopifyProductId and ShopifyProductVariantId
 * for building complete Shopify admin variant URLs.
 * Used by the Missing Sizes panel in MissingShopifyDataPanels.
 */
export async function getMissingSizeVariants(): Promise<MissingSizeItem[]> {
  const rows = await prisma.sku.findMany({
    where: { OR: [{ Size: null }, { Size: '' }] },
    select: {
      SkuID: true,
      ShopifyProductId: true,
      ShopifyProductVariantId: true,
      OrderEntryDescription: true,
    },
    orderBy: { SkuID: 'asc' },
  })
  return rows.map(r => ({
    skuId: r.SkuID,
    shopifyProductId: r.ShopifyProductId ?? null,
    shopifyVariantId: r.ShopifyProductVariantId?.toString() ?? null,
    description: r.OrderEntryDescription,
  }))
}

// ============================================================================
// Size Alias Configuration
// ============================================================================

/**
 * Get all size aliases for mapping raw sizes to canonical sizes.
 * Used by size sorting to handle format variants.
 */
export async function getSizeAliases(): Promise<{ raw: string; canonical: string }[]> {
  const rows = await prisma.sizeAlias.findMany({
    select: { RawSize: true, CanonicalSize: true },
    orderBy: { RawSize: 'asc' },
  })
  return rows.map(r => ({ raw: r.RawSize, canonical: r.CanonicalSize }))
}

// ============================================================================
// Missing Data Queries (for Missing Images/Colors panels)
// ============================================================================

export interface MissingDataItem {
  shopifyProductId: string | null
  title: string
  variantCount: number
  exampleSku: string
}

/**
 * Get products that have missing (NULL or empty) image field.
 * Groups by ShopifyProductId to show at product level (not variant level).
 * Used by the Missing Images panel on the Settings page.
 */
export async function getMissingImageProducts(): Promise<MissingDataItem[]> {
  const result = await prisma.$queryRaw<Array<{
    shopifyProductId: string | null
    title: string
    variantCount: bigint
    exampleSku: string
  }>>`
    SELECT
      ShopifyProductId as shopifyProductId,
      MIN(COALESCE(OrderEntryDescription, Description, SkuID)) AS title,
      COUNT(*) AS variantCount,
      MIN(SkuID) AS exampleSku
    FROM Sku
    WHERE ShopifyImageURL IS NULL OR LTRIM(RTRIM(ShopifyImageURL)) = ''
    GROUP BY ShopifyProductId
    ORDER BY COUNT(*) DESC
  `
  return result.map(r => ({
    shopifyProductId: r.shopifyProductId,
    title: r.title,
    variantCount: Number(r.variantCount),
    exampleSku: r.exampleSku,
  }))
}

/**
 * Get products that have missing (NULL or empty) color field.
 * Groups by ShopifyProductId to show at product level (not variant level).
 * Used by the Missing Colors panel on the Settings page.
 */
export async function getMissingColorProducts(): Promise<MissingDataItem[]> {
  const result = await prisma.$queryRaw<Array<{
    shopifyProductId: string | null
    title: string
    variantCount: bigint
    exampleSku: string
  }>>`
    SELECT
      ShopifyProductId as shopifyProductId,
      MIN(COALESCE(OrderEntryDescription, Description, SkuID)) AS title,
      COUNT(*) AS variantCount,
      MIN(SkuID) AS exampleSku
    FROM Sku
    WHERE SkuColor IS NULL OR LTRIM(RTRIM(SkuColor)) = ''
    GROUP BY ShopifyProductId
    ORDER BY COUNT(*) DESC
  `
  return result.map(r => ({
    shopifyProductId: r.shopifyProductId,
    title: r.title,
    variantCount: Number(r.variantCount),
    exampleSku: r.exampleSku,
  }))
}
