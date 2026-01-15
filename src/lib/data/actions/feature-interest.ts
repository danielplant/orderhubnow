'use server'

import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth/providers'

export interface LogFeatureInterestInput {
  feature: string
  selectedOptions?: string[]
  freeText?: string
  orderId?: string
  orderNumber?: string
}

export interface LogFeatureInterestResult {
  success: boolean
  error?: string
}

/**
 * Log user interest in an upcoming feature.
 * Captures what users expect from features before they're built.
 */
export async function logFeatureInterest(
  input: LogFeatureInterestInput
): Promise<LogFeatureInterestResult> {
  try {
    const session = await auth()
    const userId = session?.user?.loginId || session?.user?.name || 'anonymous'

    await prisma.featureInterest.create({
      data: {
        Feature: input.feature,
        SelectedOptions: input.selectedOptions?.length
          ? JSON.stringify(input.selectedOptions)
          : null,
        FreeText: input.freeText?.trim() || null,
        OrderId: input.orderId ? BigInt(input.orderId) : null,
        OrderNumber: input.orderNumber || null,
        UserId: userId,
        CreatedAt: new Date(),
      },
    })

    return { success: true }
  } catch (e) {
    console.error('logFeatureInterest error:', e)
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Failed to log feature interest',
    }
  }
}
