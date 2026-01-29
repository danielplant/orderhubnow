/**
 * GET /api/admin/shopify/schema/services
 *
 * Returns list of configured service names from ShopifyFieldMapping.
 * Used by the UI to populate the service selector dropdown.
 *
 * Returns:
 * - 200: { success: true, services: ["bulk_sync", ...] }
 * - 401: Unauthorized
 * - 500: Server error
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/providers'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await auth()
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Admin access required' } },
      { status: 401 }
    )
  }

  try {
    // Get distinct service names from mappings
    const result = await prisma.shopifyFieldMapping.findMany({
      where: { serviceName: { not: null } },
      select: { serviceName: true },
      distinct: ['serviceName'],
    })

    const services = result
      .map((r) => r.serviceName)
      .filter((s): s is string => s !== null)
      .sort()

    return NextResponse.json({ success: true, services })
  } catch (error) {
    console.error('[GetServices] Error:', error)
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch services' } },
      { status: 500 }
    )
  }
}
