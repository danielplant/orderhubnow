import { prisma } from '@/lib/prisma'
import type { InventorySettingsRecord, CompanySettingsRecord, EmailSettingsRecord } from '@/lib/types/settings'

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
 * Falls back to environment variables for backward compatibility.
 */
const DEFAULT_EMAIL_SETTINGS: EmailSettingsRecord = {
  ID: 0,
  FromEmail: process.env.EMAIL_FROM || 'orders@limeapple.com',
  FromName: 'Limeapple Orders',
  SalesTeamEmails: process.env.EMAIL_SALES || 'orders@limeapple.com',
  CCEmails: process.env.EMAIL_CC || null,
  NotifyOnNewOrder: true,
  NotifyOnOrderUpdate: false,
  SendCustomerConfirmation: true,
  UpdatedAt: new Date(),
  // SMTP defaults from environment
  SmtpHost: process.env.SMTP_HOST || null,
  SmtpPort: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : null,
  SmtpUser: process.env.SMTP_USER || null,
  SmtpPassword: process.env.SMTP_PASSWORD || null,
  SmtpSecure: process.env.SMTP_SECURE === 'true',
}

/**
 * Fetch email notification settings.
 * Returns defaults (from env vars) if no record exists.
 * SMTP fields fall back to .env if not set in database.
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
    NotifyOnNewOrder: row.NotifyOnNewOrder,
    NotifyOnOrderUpdate: row.NotifyOnOrderUpdate,
    SendCustomerConfirmation: row.SendCustomerConfirmation,
    UpdatedAt: row.UpdatedAt,
    // SMTP with env fallback for backward compatibility
    SmtpHost: row.SmtpHost || process.env.SMTP_HOST || null,
    SmtpPort: row.SmtpPort || (process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : null),
    SmtpUser: row.SmtpUser || process.env.SMTP_USER || null,
    SmtpPassword: row.SmtpPassword || process.env.SMTP_PASSWORD || null,
    SmtpSecure: row.SmtpSecure ?? (process.env.SMTP_SECURE === 'true'),
  }
}
