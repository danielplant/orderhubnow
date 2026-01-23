import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/providers'
import { prisma } from '@/lib/prisma'

interface RepPickerItem {
  id: number
  name: string
  code: string
  status: 'active' | 'legacy' | 'disabled' | 'invited'
}

/**
 * GET /api/reps/picker
 *
 * Lightweight endpoint for rep picker dialog.
 * Returns minimal fields: id, name, code, status.
 * Supports server-side search and pagination.
 *
 * Query params:
 * - search: Filter by name or code (optional)
 * - limit: Max results (default 20, max 50)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = request.nextUrl
    const search = searchParams.get('search')?.trim() || ''
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 50)

    // Build where clause for search
    const where = search
      ? {
          OR: [
            { Name: { contains: search } },
            { Code: { contains: search } },
          ],
        }
      : undefined

    // Fetch reps with their user status
    const rows = await prisma.reps.findMany({
      where,
      take: limit,
      orderBy: { Name: 'asc' },
      select: {
        ID: true,
        Name: true,
        Code: true,
        Users: {
          select: {
            Status: true,
          },
          take: 1, // Only need first user
        },
      },
    })

    const reps: RepPickerItem[] = rows.map((r) => ({
      id: r.ID,
      name: r.Name,
      code: r.Code,
      status: (r.Users[0]?.Status as RepPickerItem['status']) ?? 'invited',
    }))

    return NextResponse.json({ reps })
  } catch (error) {
    console.error('GET /api/reps/picker error:', error)
    return NextResponse.json({ error: 'Failed to fetch reps' }, { status: 500 })
  }
}
