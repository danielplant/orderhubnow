import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/providers'
import { prisma } from '@/lib/prisma'

/**
 * PUT /api/admin/shopify/images/sizes/[pixelSize]
 * Update a thumbnail size
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ pixelSize: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { pixelSize: pixelSizeStr } = await params
    const pixelSize = parseInt(pixelSizeStr, 10)
    if (isNaN(pixelSize)) {
      return NextResponse.json({ error: 'Invalid pixel size' }, { status: 400 })
    }

    const body = await request.json()
    const { quality, fit, background, enabled } = body

    const size = await prisma.thumbnailSize.update({
      where: { pixelSize },
      data: {
        ...(quality !== undefined && { quality: Math.min(100, Math.max(1, quality)) }),
        ...(fit !== undefined && { fit }),
        ...(background !== undefined && { background }),
        ...(enabled !== undefined && { enabled }),
      },
    })

    return NextResponse.json({ size })
  } catch (error) {
    console.error('Failed to update thumbnail size:', error)
    return NextResponse.json({ error: 'Failed to update size' }, { status: 500 })
  }
}

/**
 * DELETE /api/admin/shopify/images/sizes/[pixelSize]
 * Delete a thumbnail size
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ pixelSize: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { pixelSize: pixelSizeStr } = await params
    const pixelSize = parseInt(pixelSizeStr, 10)
    if (isNaN(pixelSize)) {
      return NextResponse.json({ error: 'Invalid pixel size' }, { status: 400 })
    }

    // Check if any display locations reference this size
    const usedBy = await prisma.skuImageConfig.findMany({
      where: { pixelSize },
      select: { id: true },
    })

    if (usedBy.length > 0) {
      return NextResponse.json({
        error: `Cannot delete: size is used by ${usedBy.length} display location(s)`,
        usedBy: usedBy.map(c => c.id),
      }, { status: 409 })
    }

    await prisma.thumbnailSize.delete({
      where: { pixelSize },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete thumbnail size:', error)
    return NextResponse.json({ error: 'Failed to delete size' }, { status: 500 })
  }
}
