'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import type { ActionResult, InventorySettingsEditableFields, CompanySettingsEditableFields } from '@/lib/types/settings'

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
