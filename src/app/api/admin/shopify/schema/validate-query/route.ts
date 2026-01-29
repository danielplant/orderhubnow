/**
 * POST /api/admin/shopify/schema/validate-query
 *
 * Compares generated query against hardcoded BULK_OPERATION_QUERY.
 * Used by the validation panel to verify config-driven query generation.
 *
 * Body:
 * - serviceName: The service to validate (e.g., "bulk_sync")
 * - connectionId: Optional tenant identifier (default: "default")
 *
 * Returns:
 * - 200: { success: true, match: boolean, differences?: string[], hardcoded, generated }
 * - 400: Invalid input
 * - 401: Unauthorized
 * - 500: Server error
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/providers'
import { validateQueryGeneration } from '@/lib/shopify/query-generator'

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Admin access required' } },
      { status: 401 }
    )
  }

  try {
    const body = await request.json()
    const { serviceName, connectionId = 'default' } = body

    if (!serviceName || typeof serviceName !== 'string') {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_INPUT', message: 'serviceName is required' } },
        { status: 400 }
      )
    }

    const result = await validateQueryGeneration(serviceName, connectionId)

    return NextResponse.json({
      success: true,
      match: result.match,
      differences: result.differences,
      hardcoded: result.hardcoded,
      generated: result.generated,
    })
  } catch (error) {
    console.error('[ValidateQuery] Error:', error)
    const message = error instanceof Error ? error.message : 'Validation failed'
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message } },
      { status: 500 }
    )
  }
}
