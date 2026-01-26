'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import type {
  ActionResult,
  InventorySettingsEditableFields,
  CompanySettingsEditableFields,
  EmailSettingsEditableFields,
  SyncSettingsEditableFields,
} from '@/lib/types/settings'
import { SYNC_SETTINGS_DEFAULTS } from '@/lib/types/settings'
import { invalidateSizeOrderCache, setSizeOrderCache, invalidateSizeAliasCache } from '@/lib/utils/size-sort'

/**
 * Parse a value that may be number or string to a valid number, or null.
 */
function parseNumberLike(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  return null
}

/**
 * Update inventory settings.
 * Mirrors .NET btnUpdate_Click in InventorySettings.aspx.cs.
 */
export async function updateInventorySettings(
  input: Partial<Record<keyof InventorySettingsEditableFields, unknown>>
): Promise<ActionResult> {
  try {
    const existing = await prisma.inventorySettings.findFirst()
    if (!existing) return { success: false, error: 'Settings not found' }

    const minQty = parseNumberLike(input.MinQuantityToShow)
    const usdToCad = parseNumberLike(input.USDToCADConversion)

    // Match .NET: invalid qty or multiplicator => single generic error
    if (minQty === null || !Number.isInteger(minQty) || usdToCad === null) {
      return { success: false, error: 'Please enter a valid quantity or multiplicator value!' }
    }

    await prisma.inventorySettings.update({
      where: { ID: existing.ID },
      data: {
        MinQuantityToShow: minQty,
        AllowMultipleImages: !!input.AllowMultipleImages,
        EnableZoom: !!input.EnableZoom,
        ShowShopifyImages: !!input.ShowShopifyImages,
        USDToCADConversion: usdToCad,
      },
    })

    revalidatePath('/admin/settings')
    return { success: true, message: 'Inventory Settings have been updated successfully.' }
  } catch {
    return { success: false, error: 'Sorry, there was an Error, please try again.' }
  }
}

/**
 * Increment ImageRefreshCounter.
 * .NET does this after image processing completes.
 */
async function bumpImageRefreshCounter(): Promise<ActionResult> {
  const existing = await prisma.inventorySettings.findFirst()
  if (!existing) return { success: false, error: 'Settings not found' }

  await prisma.inventorySettings.update({
    where: { ID: existing.ID },
    data: { ImageRefreshCounter: existing.ImageRefreshCounter + 1 },
  })

  revalidatePath('/admin/settings')
  return { success: true, message: 'Image refresh counter incremented.' }
}

/**
 * Resize SKU images to 300x450.
 * .NET ResizeImages() in InventorySettings.aspx.cs.
 * 
 * NOTE: Node has no built-in JPG resize like System.Drawing.
 * To fully match .NET, this needs sharp library + real images folder.
 * For MVP parity, we bump ImageRefreshCounter as the .NET page does.
 */
export async function resizeSkuImages300x450(): Promise<ActionResult> {
  // Placeholder until storage + image processing is defined
  return bumpImageRefreshCounter()
}

/**
 * Minimize/recompress big images.
 * .NET ResizeBigImages() in InventorySettings.aspx.cs.
 *
 * Same limitation as above - placeholder for now.
 */
export async function minimizeBigImages(): Promise<ActionResult> {
  // Placeholder until storage + image processing is defined
  return bumpImageRefreshCounter()
}

/**
 * Update company settings for PDF generation.
 */
export async function updateCompanySettings(
  input: CompanySettingsEditableFields
): Promise<ActionResult> {
  try {
    if (!input.CompanyName || input.CompanyName.trim().length === 0) {
      return { success: false, error: 'Company name is required' }
    }

    const existing = await prisma.companySettings.findFirst()

    const data = {
      CompanyName: input.CompanyName.trim(),
      AddressLine1: input.AddressLine1?.trim() || null,
      AddressLine2: input.AddressLine2?.trim() || null,
      Phone: input.Phone?.trim() || null,
      Fax: input.Fax?.trim() || null,
      Email: input.Email?.trim() || null,
      Website: input.Website?.trim() || null,
      LogoUrl: input.LogoUrl?.trim() || null,
    }

    if (existing) {
      await prisma.companySettings.update({
        where: { ID: existing.ID },
        data,
      })
    } else {
      await prisma.companySettings.create({ data })
    }

    revalidatePath('/admin/settings')
    return { success: true, message: 'Company settings have been updated successfully.' }
  } catch {
    return { success: false, error: 'Sorry, there was an error, please try again.' }
  }
}

/**
 * Validate email format.
 */
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

/**
 * Validate comma-separated email list.
 */
function validateEmailList(emailList: string | null): string | null {
  if (!emailList || emailList.trim().length === 0) return null

  const emails = emailList.split(',').map((e) => e.trim()).filter(Boolean)
  for (const email of emails) {
    if (!isValidEmail(email)) return null
  }
  return emails.join(', ')
}

/**
 * Update email notification settings.
 */
export async function updateEmailSettings(
  input: EmailSettingsEditableFields
): Promise<ActionResult> {
  try {
    if (!input.FromEmail || input.FromEmail.trim().length === 0) {
      return { success: false, error: 'From email is required' }
    }

    if (!isValidEmail(input.FromEmail.trim())) {
      return { success: false, error: 'Invalid from email format' }
    }

    const salesTeamEmails = validateEmailList(input.SalesTeamEmails)
    const ccEmails = validateEmailList(input.CCEmails)

    // If sales team emails were provided but invalid
    if (input.SalesTeamEmails && input.SalesTeamEmails.trim() && salesTeamEmails === null) {
      return { success: false, error: 'Invalid sales team email format' }
    }

    // If CC emails were provided but invalid
    if (input.CCEmails && input.CCEmails.trim() && ccEmails === null) {
      return { success: false, error: 'Invalid CC email format' }
    }

    const existing = await prisma.emailSettings.findFirst()

    const data = {
      FromEmail: input.FromEmail.trim(),
      FromName: input.FromName?.trim() || null,
      SalesTeamEmails: salesTeamEmails,
      CCEmails: ccEmails,
      // Order email toggles
      NotifyOnNewOrder: input.NotifyOnNewOrder,
      NotifyOnOrderUpdate: input.NotifyOnOrderUpdate,
      SendCustomerConfirmation: input.SendCustomerConfirmation,
      SendRepOrderCopy: input.SendRepOrderCopy,
      // Shipment email toggles
      SendShipmentConfirmation: input.SendShipmentConfirmation,
      SendShipmentRepNotify: input.SendShipmentRepNotify,
      SendTrackingUpdates: input.SendTrackingUpdates,
      AttachInvoicePdf: input.AttachInvoicePdf,
      AttachPackingSlipPdf: input.AttachPackingSlipPdf,
    }

    if (existing) {
      await prisma.emailSettings.update({
        where: { ID: existing.ID },
        data,
      })
    } else {
      await prisma.emailSettings.create({ data })
    }

    revalidatePath('/admin/settings')
    revalidatePath('/admin/email')
    return { success: true, message: 'Email settings have been updated successfully.' }
  } catch (err) {
    console.error('[updateEmailSettings] Error:', err)
    return { success: false, error: 'Sorry, there was an error, please try again.' }
  }
}

/**
 * SMTP settings input type.
 */
export interface SmtpSettingsInput {
  SmtpHost: string | null
  SmtpPort: number | null
  SmtpUser: string | null
  SmtpPassword: string | null
  SmtpSecure: boolean
}

/**
 * Update SMTP configuration settings.
 * These can also be set via .env for backward compatibility.
 */
export async function updateSmtpSettings(
  input: SmtpSettingsInput
): Promise<ActionResult> {
  try {
    // Validate SMTP host if provided
    if (input.SmtpHost && input.SmtpHost.trim().length === 0) {
      return { success: false, error: 'SMTP host cannot be empty if provided' }
    }

    // Validate port range
    if (input.SmtpPort !== null && (input.SmtpPort < 1 || input.SmtpPort > 65535)) {
      return { success: false, error: 'SMTP port must be between 1 and 65535' }
    }

    // Validate user email format if provided
    if (input.SmtpUser && input.SmtpUser.trim() && !isValidEmail(input.SmtpUser.trim())) {
      return { success: false, error: 'Invalid SMTP user email format' }
    }

    const existing = await prisma.emailSettings.findFirst()

    const data = {
      SmtpHost: input.SmtpHost?.trim() || null,
      SmtpPort: input.SmtpPort,
      SmtpUser: input.SmtpUser?.trim() || null,
      SmtpPassword: input.SmtpPassword || null,
      SmtpSecure: input.SmtpSecure,
    }

    if (existing) {
      await prisma.emailSettings.update({
        where: { ID: existing.ID },
        data,
      })
    } else {
      // Create new record with SMTP settings - FromEmail is required
      if (!data.SmtpHost) {
        return { success: false, error: 'SMTP host is required when creating new email settings' }
      }
      await prisma.emailSettings.create({
        data: {
          FromEmail: data.SmtpUser || 'orders@example.com', // Use SMTP user as default from
          NotifyOnNewOrder: true,
          NotifyOnOrderUpdate: false,
          SendCustomerConfirmation: true,
          ...data,
        },
      })
    }

    // Clear cached transporter so next email uses new settings
    revalidatePath('/admin/settings')
    revalidatePath('/admin/email')
    return { success: true, message: 'SMTP settings have been updated successfully.' }
  } catch {
    return { success: false, error: 'Sorry, there was an error, please try again.' }
  }
}

// ============================================================================
// Sync Settings (Shopify sync, thumbnails, backups)
// ============================================================================

/**
 * Update sync settings with versioning and history tracking.
 * Creates history snapshot before each update for audit trail.
 */
export async function updateSyncSettings(
  input: Partial<SyncSettingsEditableFields>,
  userId?: string,
  changeNote?: string
): Promise<ActionResult> {
  try {
    const existing = await prisma.syncSettings.findFirst()

    // Validate numeric fields
    if (input.thumbnailSizeSm !== undefined && (input.thumbnailSizeSm < 10 || input.thumbnailSizeSm > 1000)) {
      return { success: false, error: 'Thumbnail small size must be between 10 and 1000' }
    }
    if (input.thumbnailSizeMd !== undefined && (input.thumbnailSizeMd < 10 || input.thumbnailSizeMd > 1000)) {
      return { success: false, error: 'Thumbnail medium size must be between 10 and 1000' }
    }
    if (input.thumbnailSizeLg !== undefined && (input.thumbnailSizeLg < 10 || input.thumbnailSizeLg > 2000)) {
      return { success: false, error: 'Thumbnail large size must be between 10 and 2000' }
    }
    if (input.thumbnailQuality !== undefined && (input.thumbnailQuality < 1 || input.thumbnailQuality > 100)) {
      return { success: false, error: 'Thumbnail quality must be between 1 and 100' }
    }
    if (input.backupRetentionDays !== undefined && (input.backupRetentionDays < 1 || input.backupRetentionDays > 365)) {
      return { success: false, error: 'Backup retention days must be between 1 and 365' }
    }
    if (input.syncMaxWaitMs !== undefined && (input.syncMaxWaitMs < 60000 || input.syncMaxWaitMs > 3600000)) {
      return { success: false, error: 'Sync max wait must be between 1 minute and 1 hour' }
    }
    if (input.syncPollIntervalMs !== undefined && (input.syncPollIntervalMs < 1000 || input.syncPollIntervalMs > 60000)) {
      return { success: false, error: 'Sync poll interval must be between 1 second and 1 minute' }
    }

    const newVersion = (existing?.version ?? 0) + 1

    if (existing) {
      // Create history snapshot before update
      await prisma.syncSettingsHistory.create({
        data: {
          settingsId: existing.id,
          version: existing.version,
          snapshot: JSON.stringify(existing),
          changedBy: userId || 'system',
          changeNote: changeNote || null,
        },
      })

      // Update with incremented version
      await prisma.syncSettings.update({
        where: { id: existing.id },
        data: {
          ...input,
          version: newVersion,
          // Increment thumbnail settings version if any thumbnail setting changed
          thumbnailSettingsVersion:
            input.thumbnailSizeSm !== undefined ||
            input.thumbnailSizeMd !== undefined ||
            input.thumbnailSizeLg !== undefined ||
            input.thumbnailQuality !== undefined ||
            input.thumbnailFit !== undefined ||
            input.thumbnailBackground !== undefined
              ? existing.thumbnailSettingsVersion + 1
              : existing.thumbnailSettingsVersion,
        },
      })
    } else {
      // Create new record with defaults + input
      const newSettings = await prisma.syncSettings.create({
        data: {
          ...SYNC_SETTINGS_DEFAULTS,
          ...input,
          version: 1,
        },
      })

      // Create initial history entry
      await prisma.syncSettingsHistory.create({
        data: {
          settingsId: newSettings.id,
          version: 0,
          snapshot: JSON.stringify({ ...SYNC_SETTINGS_DEFAULTS, version: 0 }),
          changedBy: userId || 'system',
          changeNote: 'Initial settings created',
        },
      })
    }

    revalidatePath('/admin/dev/shopify/settings')
    return { success: true, message: 'Sync settings have been updated successfully.' }
  } catch (err) {
    console.error('[updateSyncSettings] Error:', err)
    return { success: false, error: 'Sorry, there was an error updating sync settings.' }
  }
}

/**
 * Restore sync settings from a historical version.
 */
export async function restoreSyncSettings(
  historyId: number,
  userId?: string
): Promise<ActionResult> {
  try {
    const historyRecord = await prisma.syncSettingsHistory.findUnique({
      where: { id: historyId },
    })

    if (!historyRecord) {
      return { success: false, error: 'History record not found' }
    }

    const snapshot = JSON.parse(historyRecord.snapshot) as Record<string, unknown>

    // Remove non-editable fields from snapshot
    const { id: _id, version: _version, updatedAt: _updatedAt, ...editableFields } = snapshot

    return updateSyncSettings(
      editableFields as Partial<SyncSettingsEditableFields>,
      userId,
      `Restored from version ${historyRecord.version}`
    )
  } catch (err) {
    console.error('[restoreSyncSettings] Error:', err)
    return { success: false, error: 'Sorry, there was an error restoring settings.' }
  }
}

// ============================================================================
// Size Order Configuration
// ============================================================================

/**
 * Update size order configuration.
 * Validates for duplicates and empty list.
 * Invalidates runtime cache after save.
 */
export async function updateSizeOrderConfig(
  sizes: string[],
  updatedBy?: string
): Promise<ActionResult> {
  try {
    // Preserve raw sizes exactly as-is from Shopify, only filter out empty strings
    const cleaned = sizes
      .map(s => (s ?? '').toString())
      .filter(s => s !== '')

    if (cleaned.length === 0) {
      return { success: false, error: 'At least one size is required' }
    }

    // Check for duplicates (case-insensitive)
    const seenUpper = new Set<string>()
    const unique: string[] = []
    for (const s of cleaned) {
      const upper = s.toUpperCase()
      if (!seenUpper.has(upper)) {
        seenUpper.add(upper)
        unique.push(s)
      }
    }
    if (unique.length !== cleaned.length) {
      return { success: false, error: 'Duplicate sizes detected (case-insensitive check)' }
    }

    const existing = await prisma.sizeOrderConfig.findFirst()
    const data = {
      Sizes: JSON.stringify(unique),
      UpdatedBy: updatedBy || 'admin',
    }

    if (existing) {
      await prisma.sizeOrderConfig.update({
        where: { ID: existing.ID },
        data,
      })
    } else {
      await prisma.sizeOrderConfig.create({ data })
    }

    // Invalidate runtime cache so next sort uses new order
    invalidateSizeOrderCache()
    // Also pre-populate the cache with new values
    setSizeOrderCache(unique)

    revalidatePath('/admin/settings')
    return { success: true, message: 'Size order updated successfully.' }
  } catch (err) {
    console.error('[updateSizeOrderConfig] Error:', err)
    return { success: false, error: 'Sorry, there was an error updating size order.' }
  }
}

// ============================================================================
// Size Alias Actions
// ============================================================================

/**
 * Create or update a size alias.
 * Maps a raw Shopify size to a canonical size for sorting.
 */
export async function upsertSizeAlias(
  raw: string,
  canonical: string,
  updatedBy?: string
): Promise<ActionResult> {
  try {
    if (!raw || !canonical) {
      return { success: false, error: 'Both raw size and canonical size are required' }
    }

    await prisma.sizeAlias.upsert({
      where: { RawSize: raw },
      update: { CanonicalSize: canonical, UpdatedBy: updatedBy ?? 'admin' },
      create: { RawSize: raw, CanonicalSize: canonical, UpdatedBy: updatedBy ?? 'admin' },
    })

    // Invalidate alias cache so next sort uses new mapping
    invalidateSizeAliasCache()

    revalidatePath('/admin/settings')
    return { success: true, message: 'Size alias saved.' }
  } catch (err) {
    console.error('[upsertSizeAlias] Error:', err)
    return { success: false, error: 'Sorry, there was an error saving the size alias.' }
  }
}

/**
 * Delete a size alias.
 */
export async function deleteSizeAlias(raw: string): Promise<ActionResult> {
  try {
    if (!raw) {
      return { success: false, error: 'Raw size is required' }
    }

    await prisma.sizeAlias.delete({ where: { RawSize: raw } })

    // Invalidate alias cache
    invalidateSizeAliasCache()

    revalidatePath('/admin/settings')
    return { success: true, message: 'Size alias deleted.' }
  } catch (err) {
    console.error('[deleteSizeAlias] Error:', err)
    return { success: false, error: 'Sorry, there was an error deleting the size alias.' }
  }
}

/**
 * Remove a canonical size and its associated aliases atomically.
 * Uses a database transaction to ensure all-or-nothing behavior.
 */
export async function removeCanonicalSizeWithAliases(
  aliasRawSizes: string[],
  newSizeOrder: string[],
  updatedBy?: string
): Promise<ActionResult> {
  try {
    // Validate new size order
    const cleaned = newSizeOrder
      .map(s => (s ?? '').toString())
      .filter(s => s !== '')

    if (cleaned.length === 0) {
      return { success: false, error: 'At least one size is required' }
    }

    // Check for duplicates (case-insensitive)
    const seenUpper = new Set<string>()
    const unique: string[] = []
    for (const s of cleaned) {
      const upper = s.toUpperCase()
      if (!seenUpper.has(upper)) {
        seenUpper.add(upper)
        unique.push(s)
      }
    }
    if (unique.length !== cleaned.length) {
      return { success: false, error: 'Duplicate sizes detected (case-insensitive check)' }
    }

    // Execute both operations in a transaction
    await prisma.$transaction(async (tx) => {
      // 1. Delete all affected aliases
      if (aliasRawSizes.length > 0) {
        await tx.sizeAlias.deleteMany({
          where: { RawSize: { in: aliasRawSizes } }
        })
      }

      // 2. Update size order config
      const existing = await tx.sizeOrderConfig.findFirst()
      const data = {
        Sizes: JSON.stringify(unique),
        UpdatedBy: updatedBy || 'admin',
      }

      if (existing) {
        await tx.sizeOrderConfig.update({
          where: { ID: existing.ID },
          data,
        })
      } else {
        await tx.sizeOrderConfig.create({ data })
      }
    })

    // Invalidate both caches
    invalidateSizeAliasCache()
    invalidateSizeOrderCache()
    setSizeOrderCache(unique)

    revalidatePath('/admin/settings')
    return {
      success: true,
      message: `Size removed and ${aliasRawSizes.length} alias(es) deleted.`
    }
  } catch (err) {
    console.error('[removeCanonicalSizeWithAliases] Error:', err)
    return { success: false, error: 'Sorry, there was an error removing the size. No changes were made.' }
  }
}
