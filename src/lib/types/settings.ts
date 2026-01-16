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
 * Company settings for PDF generation and branding.
 */
export type CompanySettingsRecord = {
  ID: number
  CompanyName: string
  AddressLine1: string | null
  AddressLine2: string | null
  Phone: string | null
  Fax: string | null
  Email: string | null
  Website: string | null
  LogoUrl: string | null
}

/**
 * Editable fields for company settings.
 */
export type CompanySettingsEditableFields = Omit<CompanySettingsRecord, 'ID'>

/**
 * Email notification settings.
 */
export type EmailSettingsRecord = {
  ID: number
  FromEmail: string
  FromName: string | null
  SalesTeamEmails: string | null
  CCEmails: string | null
  NotifyOnNewOrder: boolean
  NotifyOnOrderUpdate: boolean
  SendCustomerConfirmation: boolean
  UpdatedAt: Date

  // SMTP Configuration - falls back to .env if not set in DB
  SmtpHost: string | null
  SmtpPort: number | null
  SmtpUser: string | null
  SmtpPassword: string | null
  SmtpSecure: boolean
}

/**
 * Editable fields for email settings (notification preferences only).
 * SMTP settings are edited separately via updateSmtpSettings.
 */
export type EmailSettingsEditableFields = Omit<EmailSettingsRecord, 'ID' | 'UpdatedAt' | 'SmtpHost' | 'SmtpPort' | 'SmtpUser' | 'SmtpPassword' | 'SmtpSecure'>

/**
 * Standard action result for server actions.
 */
export type ActionResult =
  | { success: true; message?: string }
  | { success: false; error: string }
