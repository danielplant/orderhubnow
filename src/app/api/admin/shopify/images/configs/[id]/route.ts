import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/providers'
import { prisma } from '@/lib/prisma'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()

    // Validate the config exists
    const existing = await prisma.skuImageConfig.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'Configuration not found' },
        { status: 404 }
      )
    }

    // Update only allowed fields
    const updated = await prisma.skuImageConfig.update({
      where: { id },
      data: {
        pixelSize: body.pixelSize !== undefined ? body.pixelSize : existing.pixelSize,
        primary: body.primary !== undefined ? body.primary : existing.primary,
        fallback: body.fallback !== undefined ? body.fallback : existing.fallback,
        enabled: body.enabled !== undefined ? body.enabled : existing.enabled,
      },
    })

    return NextResponse.json({ config: updated })
  } catch (error) {
    console.error('Error updating image config:', error)
    return NextResponse.json(
      { error: 'Failed to update configuration' },
      { status: 500 }
    )
  }
}
