import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/providers'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const configs = await prisma.skuImageConfig.findMany({
      orderBy: { sortOrder: 'asc' },
    })

    return NextResponse.json({ configs })
  } catch (error) {
    console.error('Error fetching image configs:', error)
    return NextResponse.json(
      { error: 'Failed to fetch image configurations' },
      { status: 500 }
    )
  }
}
