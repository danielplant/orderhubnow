import { NextRequest, NextResponse } from 'next/server'
import { encode } from 'next-auth/jwt'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { mapUserTypeToRole } from '@/lib/types/auth'
import { auth } from '@/lib/auth/providers'

/**
 * POST /api/dev/switcher/switch
 *
 * Dev-only endpoint to switch the authenticated user session.
 * Bypasses normal authentication for fast QA testing.
 *
 * Request body: { userId: number }
 * Response: { redirectTo: string }
 */
export async function POST(request: NextRequest) {
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

  // Detect secret (support both env var names)
  const authSecret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET
  if (!authSecret) {
    return NextResponse.json(
      { error: 'Auth secret not configured' },
      { status: 500 }
    )
  }

  try {
    const body = await request.json()
    const { userId } = body

    if (!userId || typeof userId !== 'number') {
      return NextResponse.json(
        { error: 'Invalid userId' },
        { status: 400 }
      )
    }

    // Look up target user
    const user = await prisma.users.findUnique({
      where: { ID: userId },
      select: {
        ID: true,
        LoginID: true,
        Email: true,
        UserType: true,
        RepId: true,
        Status: true,
      },
    })

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    // Block switching to disabled/invited users
    if (user.Status === 'disabled' || user.Status === 'invited') {
      return NextResponse.json(
        { error: `Cannot switch to ${user.Status} user` },
        { status: 400 }
      )
    }

    // Map role
    const role = mapUserTypeToRole(user.UserType)
    if (!role) {
      return NextResponse.json(
        { error: 'Unknown user role' },
        { status: 400 }
      )
    }

    // Build JWT payload (matches authConfig.callbacks.jwt)
    const tokenPayload = {
      id: user.ID,
      loginId: user.Email || user.LoginID,
      role,
      repId: user.RepId,
      name: user.Email || user.LoginID,
      // Standard JWT fields
      sub: String(user.ID),
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60, // 30 days
    }

    // Detect existing cookie name from request (different environments use different names)
    const cookieStore = await cookies()
    const existingCookieNames = ['authjs.session-token', '__Secure-authjs.session-token', 'next-auth.session-token']
    const cookieName = existingCookieNames.find(name => cookieStore.has(name)) || 'authjs.session-token'

    // Encode JWT (use cookie name as salt for compatibility)
    const token = await encode({
      token: tokenPayload,
      secret: authSecret,
      salt: cookieName,
    })

    cookieStore.set(cookieName, token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      // Don't set secure in dev (localhost)
      secure: false,
      maxAge: 30 * 24 * 60 * 60, // 30 days
    })

    // Determine redirect based on role
    const redirectTo = role === 'admin' ? '/admin' : '/rep'

    return NextResponse.json({ redirectTo })
  } catch (error) {
    console.error('[dev/switcher/switch] Error:', error)
    return NextResponse.json(
      { error: 'Failed to switch user' },
      { status: 500 }
    )
  }
}
