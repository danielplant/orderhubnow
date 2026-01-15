import { prisma } from '@/lib/prisma'

export interface FeatureInterestRow {
  id: string
  feature: string
  selectedOptions: string[]
  freeText: string | null
  orderId: string | null
  orderNumber: string | null
  userId: string | null
  createdAt: string
}

export interface FeatureSummary {
  feature: string
  count: number
}

/**
 * Get all feature interest entries, optionally filtered by feature.
 */
export async function getFeatureInterestList(
  feature?: string
): Promise<FeatureInterestRow[]> {
  const entries = await prisma.featureInterest.findMany({
    where: feature ? { Feature: feature } : undefined,
    orderBy: { CreatedAt: 'desc' },
  })

  return entries.map((e) => ({
    id: e.ID.toString(),
    feature: e.Feature,
    selectedOptions: e.SelectedOptions ? JSON.parse(e.SelectedOptions) : [],
    freeText: e.FreeText,
    orderId: e.OrderId?.toString() || null,
    orderNumber: e.OrderNumber,
    userId: e.UserId,
    createdAt: e.CreatedAt.toISOString(),
  }))
}

/**
 * Get summary counts by feature.
 */
export async function getFeatureInterestSummary(): Promise<FeatureSummary[]> {
  const results = await prisma.featureInterest.groupBy({
    by: ['Feature'],
    _count: { Feature: true },
    orderBy: { _count: { Feature: 'desc' } },
  })

  return results.map((r) => ({
    feature: r.Feature,
    count: r._count.Feature,
  }))
}

/**
 * Get unique feature names for filter dropdown.
 */
export async function getFeatureNames(): Promise<string[]> {
  const results = await prisma.featureInterest.findMany({
    select: { Feature: true },
    distinct: ['Feature'],
    orderBy: { Feature: 'asc' },
  })

  return results.map((r) => r.Feature)
}
