import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { mapUserTypeToRole } from '@/lib/types/auth'
import { auth } from '@/lib/auth/providers'

/**
 * GET /api/dev/switcher/users
 *
 * Dev-only endpoint to list users for the account switcher.
 * Returns users with their role, repId, name, and status.
 * Filters out disabled and invited users.
 */
export async function GET(request: NextRequest) {
  // Guard: Only available in development
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json(
      { error: 'This endpoint is only available in development' },
      { status: 403 }
    )
  }

  // Guard: Require admin session
  const session = await auth()
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json(
      { error: 'Admin access required' },
      { status: 403 }
    )
  }

  const searchParams = request.nextUrl.searchParams
  const search = searchParams.get('search') || ''

  try {
    // Query users, excluding disabled and invited
    const users = await prisma.users.findMany({
      where: {
        Status: { notIn: ['disabled', 'invited'] },
        ...(search
          ? {
              OR: [
                { LoginID: { contains: search } },
                { Email: { contains: search } },
              ],
            }
          : {}),
      },
      select: {
        ID: true,
        LoginID: true,
        Email: true,
        UserType: true,
        RepId: true,
        Status: true,
      },
      orderBy: [
        { UserType: 'asc' }, // Admin first
        { LoginID: 'asc' },
      ],
      take: 50,
    })

    // Map to response format
    const result = users.map((user) => ({
      id: user.ID,
      loginId: user.Email || user.LoginID,
      role: mapUserTypeToRole(user.UserType) || 'unknown',
      repId: user.RepId,
      name: user.Email || user.LoginID,
      status: user.Status || 'unknown',
    }))

    return NextResponse.json({ users: result })
  } catch (error) {
    console.error('[dev/switcher/users] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 }
    )
  }
}
