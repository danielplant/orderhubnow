import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import type { AvailabilitySettingsRecord } from '@/lib/types/availability-settings'
import { normalizeAvailabilitySettings } from '@/lib/availability/settings'

export async function updateAvailabilitySettings(
  input: AvailabilitySettingsRecord,
  updatedBy?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const settings = normalizeAvailabilitySettings(input)
    const existing = await prisma.availabilitySettings.findFirst()

    const data = {
      matrixConfig: JSON.stringify(settings.matrix),
      showOnRouteProducts: settings.showOnRouteProducts,
      showOnRouteInventory: settings.showOnRouteInventory,
      showOnRouteXlsx: settings.showOnRouteXlsx,
      showOnRoutePdf: settings.showOnRoutePdf,
      onRouteLabelProducts: settings.onRouteLabelProducts,
      onRouteLabelInventory: settings.onRouteLabelInventory,
      onRouteLabelXlsx: settings.onRouteLabelXlsx,
      onRouteLabelPdf: settings.onRouteLabelPdf,
      legendText: settings.legendText,
      showLegendAts: settings.showLegendAts,
      showLegendPreorderIncoming: settings.showLegendPreorderIncoming,
      showLegendPreorderNoIncoming: settings.showLegendPreorderNoIncoming,
      updatedBy: updatedBy ?? null,
      updatedAt: new Date(),
    }

    if (existing) {
      await prisma.availabilitySettings.update({
        where: { id: existing.id },
        data,
      })
    } else {
      await prisma.availabilitySettings.create({ data })
    }

    revalidatePath('/admin/settings')
    revalidatePath('/admin/products')
    revalidatePath('/admin/inventory')
    return { success: true }
  } catch (err) {
    console.error('[updateAvailabilitySettings] Error:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to update availability settings',
    }
  }
}
