/**
 * Export Policy API
 *
 * GET: Fetch current export policy from SyncSettings
 * PUT: Update export policy fields in SyncSettings
 *
 * Phase 1: Single Source of Truth for Export Policy
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/providers'
import { getExportPolicy, updateExportPolicy, type ExportPolicy } from '@/lib/data/queries/export-policy'

/**
 * GET /api/admin/shopify/settings/export-policy
 * Returns current export policy configuration
 */
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const policy = await getExportPolicy()

    return NextResponse.json({ policy })
  } catch (error) {
    console.error('Failed to fetch export policy:', error)
    return NextResponse.json(
      { error: 'Failed to fetch export policy' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/admin/shopify/settings/export-policy
 * Updates export policy configuration
 *
 * Body: Partial<ExportPolicy>
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    // Validate input
    const updates: Partial<ExportPolicy> = {}

    if (body.thumbnailSize !== undefined) {
      const size = Number(body.thumbnailSize)
      if (isNaN(size) || size < 60 || size > 1024) {
        return NextResponse.json(
          { error: 'Thumbnail size must be between 60 and 1024 pixels' },
          { status: 400 }
        )
      }
      updates.thumbnailSize = size
    }

    if (body.excelDisplayPx !== undefined) {
      const size = Number(body.excelDisplayPx)
      if (isNaN(size) || size < 32 || size > 256) {
        return NextResponse.json(
          { error: 'Excel display size must be between 32 and 256 pixels' },
          { status: 400 }
        )
      }
      updates.excelDisplayPx = size
    }

    if (body.pdfDisplayPx !== undefined) {
      const size = Number(body.pdfDisplayPx)
      if (isNaN(size) || size < 32 || size > 256) {
        return NextResponse.json(
          { error: 'PDF display size must be between 32 and 256 pixels' },
          { status: 400 }
        )
      }
      updates.pdfDisplayPx = size
    }

    if (body.requireS3 !== undefined) {
      updates.requireS3 = Boolean(body.requireS3)
    }

    if (body.allowShopifyFallback !== undefined) {
      updates.allowShopifyFallback = Boolean(body.allowShopifyFallback)
    }

    if (body.imageConcurrency !== undefined) {
      const concurrency = Number(body.imageConcurrency)
      if (isNaN(concurrency) || concurrency < 1 || concurrency > 50) {
        return NextResponse.json(
          { error: 'Image concurrency must be between 1 and 50' },
          { status: 400 }
        )
      }
      updates.imageConcurrency = concurrency
    }

    const updatedPolicy = await updateExportPolicy(updates)

    return NextResponse.json({ policy: updatedPolicy })
  } catch (error) {
    console.error('Failed to update export policy:', error)
    return NextResponse.json(
      { error: 'Failed to update export policy' },
      { status: 500 }
    )
  }
}
