import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/providers'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/admin/shopify/images/sizes
 * Returns all thumbnail sizes
 */
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const sizes = await prisma.thumbnailSize.findMany({
      orderBy: { sortOrder: 'asc' },
    })

    return NextResponse.json({ sizes })
  } catch (error) {
    console.error('Failed to fetch thumbnail sizes:', error)
    return NextResponse.json({ error: 'Failed to fetch sizes' }, { status: 500 })
  }
}

/**
 * POST /api/admin/shopify/images/sizes
 * Create a new thumbnail size
 */
export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { pixelSize, quality = 80, fit = 'contain', background = '#FFFFFF' } = body

    if (!pixelSize || typeof pixelSize !== 'number' || pixelSize < 16 || pixelSize > 2048) {
      return NextResponse.json({ error: 'Invalid pixel size (must be 16-2048)' }, { status: 400 })
    }

    // Check if already exists
    const existing = await prisma.thumbnailSize.findUnique({
      where: { pixelSize },
    })
    if (existing) {
      return NextResponse.json({ error: `Size ${pixelSize}px already exists` }, { status: 409 })
    }

    // Get max sortOrder
    const maxSort = await prisma.thumbnailSize.aggregate({
      _max: { sortOrder: true },
    })

    const size = await prisma.thumbnailSize.create({
      data: {
        pixelSize,
        quality: Math.min(100, Math.max(1, quality)),
        fit,
        background,
        enabled: true,
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
      },
    })

    return NextResponse.json({ size })
  } catch (error) {
    console.error('Failed to create thumbnail size:', error)
    return NextResponse.json({ error: 'Failed to create size' }, { status: 500 })
  }
}
