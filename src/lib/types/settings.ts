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

// ============================================================================
// Size Order Configuration
// ============================================================================

/**
 * Size order configuration record.
 * Defines how sizes sort across product cards and reports.
 * Single-row table pattern.
 */
export type SizeOrderConfigRecord = {
  ID: number
  Sizes: string[]
  UpdatedAt: Date
  UpdatedBy: string | null
}

// ============================================================================
// Sync Settings (Shopify sync, thumbnails, backups)
// ============================================================================

/**
 * Full record from SyncSettings table.
 * Single-row table with versioning for audit trail.
 */
export type SyncSettingsRecord = {
  id: number
  version: number

  // Thumbnail Configuration
  thumbnailSettingsVersion: number
  thumbnailSizeSm: number
  thumbnailSizeMd: number
  thumbnailSizeLg: number
  thumbnailQuality: number
  thumbnailFit: string
  thumbnailBackground: string

  // Thumbnail Processing
  thumbnailFetchTimeoutMs: number
  thumbnailBatchConcurrency: number
  thumbnailEnabled: boolean

  // Backup Settings
  backupEnabled: boolean
  backupRetentionDays: number
  cleanupStaleBackups: boolean

  // Sync Settings
  syncMaxWaitMs: number
  syncPollIntervalMs: number

  updatedAt: Date
}

/**
 * Fields editable via the Settings page.
 */
export type SyncSettingsEditableFields = Omit<SyncSettingsRecord, 'id' | 'version' | 'updatedAt'>

/**
 * History record for sync settings changes.
 */
export type SyncSettingsHistoryRecord = {
  id: number
  settingsId: number
  version: number
  snapshot: string // JSON string of SyncSettingsRecord
  changedBy: string | null
  changedAt: Date
  changeNote: string | null
}

/**
 * Default values for sync settings.
 * Used when no settings exist in DB.
 */
export const SYNC_SETTINGS_DEFAULTS: SyncSettingsEditableFields = {
  thumbnailSettingsVersion: 3,
  thumbnailSizeSm: 120,
  thumbnailSizeMd: 240,
  thumbnailSizeLg: 480,
  thumbnailQuality: 80,
  thumbnailFit: 'contain',
  thumbnailBackground: '#FFFFFF',
  thumbnailFetchTimeoutMs: 15000,
  thumbnailBatchConcurrency: 10,
  thumbnailEnabled: true,
  backupEnabled: true,
  backupRetentionDays: 7,
  cleanupStaleBackups: true,
  syncMaxWaitMs: 600000,
  syncPollIntervalMs: 3000,
}
