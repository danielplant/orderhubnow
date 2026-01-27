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
 * All fields configured via Admin UI (no .env fallback).
 */
export type EmailSettingsRecord = {
  ID: number
  FromEmail: string | null
  FromName: string | null
  SalesTeamEmails: string | null
  CCEmails: string | null
  // Order email toggles
  NotifyOnNewOrder: boolean
  NotifyOnOrderUpdate: boolean
  SendCustomerConfirmation: boolean
  SendRepOrderCopy: boolean
  // Shipment email toggles
  SendShipmentConfirmation: boolean
  SendShipmentRepNotify: boolean
  SendTrackingUpdates: boolean
  AttachInvoicePdf: boolean
  AttachPackingSlipPdf: boolean
  UpdatedAt: Date

  // SMTP Configuration (DB only)
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
  ValidatedSizes: string[]
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
  thumbnailSizeXl: number
  thumbnailQuality: number
  thumbnailFit: string
  thumbnailBackground: string

  // Thumbnail Processing
  thumbnailFetchTimeoutMs: number
  thumbnailBatchConcurrency: number
  thumbnailEnabled: boolean

  // Per-size enable toggles
  thumbnailSizeSmEnabled: boolean
  thumbnailSizeMdEnabled: boolean
  thumbnailSizeLgEnabled: boolean
  thumbnailSizeXlEnabled: boolean

  // Control whether thumbnails run during sync
  thumbnailDuringSync: boolean

  // Backup Settings
  backupEnabled: boolean
  backupRetentionDays: number
  cleanupStaleBackups: boolean

  // Sync Settings
  syncMaxWaitMs: number
  syncPollIntervalMs: number

  // Image Source Settings
  // false = use product.featuredMedia (single featured image)
  // true = use product.images gallery (first image from gallery)
  useProductImageGallery: boolean

  // Shopify Store Domain (for building admin links in Missing Data panels)
  shopifyStoreDomain: string | null

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
  thumbnailSettingsVersion: 5,
  thumbnailSizeSm: 120,
  thumbnailSizeMd: 240,
  thumbnailSizeLg: 480,
  thumbnailSizeXl: 720,
  thumbnailQuality: 80,
  thumbnailFit: 'contain',
  thumbnailBackground: '#FFFFFF',
  thumbnailFetchTimeoutMs: 15000,
  thumbnailBatchConcurrency: 10,
  thumbnailEnabled: true,
  thumbnailSizeSmEnabled: true,
  thumbnailSizeMdEnabled: true,
  thumbnailSizeLgEnabled: true,
  thumbnailSizeXlEnabled: true,
  thumbnailDuringSync: false, // Off by default - generate separately
  backupEnabled: true,
  backupRetentionDays: 7,
  cleanupStaleBackups: true,
  syncMaxWaitMs: 600000,
  syncPollIntervalMs: 3000,
  useProductImageGallery: false, // Default: use featured image only
  shopifyStoreDomain: null, // Set to e.g. "limeappleonline.myshopify.com" for Shopify admin links
}

// ============================================================================
// Thumbnail Generation Run
// ============================================================================

/**
 * Record from ThumbnailGenerationRun table.
 * Tracks standalone thumbnail generation progress.
 */
export type ThumbnailGenerationRunRecord = {
  id: bigint
  status: string
  startedAt: Date
  completedAt: Date | null
  currentStep: string | null
  currentStepDetail: string | null
  progressPercent: number | null
  totalImages: number | null
  processedCount: number | null
  skippedCount: number | null
  failedCount: number | null
  enabledSizes: string | null // JSON array
  errorMessage: string | null
}
