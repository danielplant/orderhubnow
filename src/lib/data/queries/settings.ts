import { prisma } from '@/lib/prisma'
import type { InventorySettingsRecord, CompanySettingsRecord } from '@/lib/types/settings'

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
