/**
 * POST /api/admin/shopify/filter-preview/[type]
 *
 * Previews the impact of proposed filters without applying them.
 * Shows how many records would be included/excluded.
 *
 * Currently supports ProductStatus filter on Product/ProductVariant entities.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/providers'
import { prisma } from '@/lib/prisma'
import { getKnownEntities } from '@/lib/shopify/introspect'

interface RouteParams {
  params: Promise<{ type: string }>
}

interface FilterInput {
  fieldPath: string
  operator: string // equals, in, not_in
  value: string // Single value or JSON array
  enabled: boolean
}

interface FilterPreviewBody {
  filters: FilterInput[]
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { type } = await params

  // Validate entity type
  const knownEntities = getKnownEntities()
  if (!knownEntities.some((e) => e.name === type)) {
    return NextResponse.json({ error: `Unknown entity type: ${type}` }, { status: 400 })
  }

  let body: FilterPreviewBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.filters || !Array.isArray(body.filters)) {
    return NextResponse.json({ error: 'filters array is required' }, { status: 400 })
  }

  try {
    // Currently only support Product/ProductVariant filtering via RawSkusFromShopify
    if (type !== 'Product' && type !== 'ProductVariant') {
      return NextResponse.json({
        success: true,
        entityType: type,
        message: 'Filter preview only supported for Product/ProductVariant entities',
        currentTotal: 0,
        afterFilterTotal: 0,
        excluded: 0,
        distribution: {},
      })
    }

    // Get current status distribution from RawSkusFromShopify
    const distribution = await prisma.$queryRaw<Array<{ ProductStatus: string | null; count: bigint }>>`
      SELECT ProductStatus, COUNT(*) as count
      FROM RawSkusFromShopify
      GROUP BY ProductStatus
    `

    const distMap: Record<string, number> = {}
    let total = 0

    for (const row of distribution) {
      const status = row.ProductStatus || 'NULL'
      const count = Number(row.count)
      distMap[status] = count
      total += count
    }

    // Calculate filter impact
    let afterFilterTotal = total

    // Find status filter
    const statusFilter = body.filters.find((f) => f.fieldPath === 'status' && f.enabled)

    if (statusFilter) {
      // Parse filter value
      let allowedStatuses: string[] = []

      try {
        const parsed = JSON.parse(statusFilter.value)
        allowedStatuses = Array.isArray(parsed) ? parsed : [parsed]
      } catch {
        allowedStatuses = [statusFilter.value]
      }

      // Calculate matching count
      if (statusFilter.operator === 'equals' || statusFilter.operator === 'in') {
        afterFilterTotal = allowedStatuses.reduce((sum, status) => sum + (distMap[status] || 0), 0)
      } else if (statusFilter.operator === 'not_in') {
        const excludedCount = allowedStatuses.reduce((sum, status) => sum + (distMap[status] || 0), 0)
        afterFilterTotal = total - excludedCount
      }
    }

    return NextResponse.json({
      success: true,
      entityType: type,
      currentTotal: total,
      afterFilterTotal,
      excluded: total - afterFilterTotal,
      distribution: distMap,
    })
  } catch (error) {
    console.error(`Error previewing filters for ${type}:`, error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * GET /api/admin/shopify/filter-preview/[type]
 *
 * Returns current filter status distribution without proposed filters.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { type } = await params

  // Validate entity type
  const knownEntities = getKnownEntities()
  if (!knownEntities.some((e) => e.name === type)) {
    return NextResponse.json({ error: `Unknown entity type: ${type}` }, { status: 400 })
  }

  try {
    if (type !== 'Product' && type !== 'ProductVariant') {
      return NextResponse.json({
        success: true,
        entityType: type,
        total: 0,
        distribution: {},
      })
    }

    // Get current status distribution
    const distribution = await prisma.$queryRaw<Array<{ ProductStatus: string | null; count: bigint }>>`
      SELECT ProductStatus, COUNT(*) as count
      FROM RawSkusFromShopify
      GROUP BY ProductStatus
    `

    const distMap: Record<string, number> = {}
    let total = 0

    for (const row of distribution) {
      const status = row.ProductStatus || 'NULL'
      const count = Number(row.count)
      distMap[status] = count
      total += count
    }

    // Get current active filter config
    const activeFilters = await prisma.syncFilterConfig.findMany({
      where: { entityType: 'Product', enabled: true },
    })

    return NextResponse.json({
      success: true,
      entityType: type,
      total,
      distribution: distMap,
      activeFilters: activeFilters.map((f) => ({
        fieldPath: f.fieldPath,
        operator: f.operator,
        value: f.value,
      })),
    })
  } catch (error) {
    console.error(`Error fetching filter distribution for ${type}:`, error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
