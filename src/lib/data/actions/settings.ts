'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import type { ActionResult, InventorySettingsEditableFields, CompanySettingsEditableFields, EmailSettingsEditableFields } from '@/lib/types/settings'

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
      NotifyOnNewOrder: input.NotifyOnNewOrder,
      NotifyOnOrderUpdate: input.NotifyOnOrderUpdate,
      SendCustomerConfirmation: input.SendCustomerConfirmation,
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
    return { success: true, message: 'Email settings have been updated successfully.' }
  } catch {
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
      // Create new record with SMTP settings and defaults for other fields
      await prisma.emailSettings.create({
        data: {
          FromEmail: process.env.EMAIL_FROM || 'orders@example.com',
          NotifyOnNewOrder: true,
          NotifyOnOrderUpdate: false,
          SendCustomerConfirmation: true,
          ...data,
        },
      })
    }

    // Clear cached transporter so next email uses new settings
    revalidatePath('/admin/settings')
    return { success: true, message: 'SMTP settings have been updated successfully.' }
  } catch {
    return { success: false, error: 'Sorry, there was an error, please try again.' }
  }
}
