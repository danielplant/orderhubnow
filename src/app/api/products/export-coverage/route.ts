/**
 * Export Coverage Check API
 *
 * GET /api/products/export-coverage
 *
 * Returns thumbnail coverage status for the configured export size.
 * Used by frontend to check if exports can proceed.
 *
 * Phase 2: Enforce S3-Only Export Policy
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/providers'
import { getExportPolicy } from '@/lib/data/queries/export-policy'
import { getThumbnailCoverageForExport } from '@/lib/data/queries/thumbnail-coverage'

/**
 * GET /api/products/export-coverage
 *
 * Returns coverage status for the export thumbnail size.
 * Accessible by both admin and rep roles.
 */
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user || (session.user.role !== 'admin' && session.user.role !== 'rep')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get export policy to determine which size to check
    const policy = await getExportPolicy()

    // Get coverage for the export thumbnail size
    const coverage = await getThumbnailCoverageForExport(policy.thumbnailSize)

    // Determine if export is ready
    // Admins require 100% coverage, reps can proceed with fallback
    const ready = coverage.coveragePercent === 100 || 
                  !policy.requireS3 || 
                  session.user.role === 'rep'

    return NextResponse.json({
      ready,
      requireS3: policy.requireS3,
      allowShopifyFallback: policy.allowShopifyFallback,
      coverage,
      role: session.user.role,
      message: !ready && session.user.role === 'admin' 
        ? 'Generate missing thumbnails before exporting' 
        : undefined,
    })
  } catch (error) {
    console.error('Export coverage check error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
