/**
 * Public API endpoint for image configuration.
 * No authentication required - read-only config data.
 * Cached for 60 seconds.
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const revalidate = 60

export async function GET() {
  try {
    const configs = await prisma.skuImageConfig.findMany({
      where: { enabled: true },
      orderBy: { sortOrder: 'asc' },
    })

    return NextResponse.json(
      { configs },
      {
        headers: {
          'Cache-Control': 'public, max-age=60, stale-while-revalidate=120',
        },
      }
    )
  } catch (error) {
    console.error('[image-configs] Failed to fetch configs:', error)
    return NextResponse.json(
      { error: 'Failed to fetch image configs', configs: [] },
      { status: 500 }
    )
  }
}
