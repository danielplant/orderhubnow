import { NextResponse } from 'next/server'
import { validateToken, markTokenUsed } from '@/lib/auth/tokens'
import { hashPassword, validatePasswordStrength } from '@/lib/auth/password'
import { prisma } from '@/lib/prisma'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { token, password } = body

    if (!token || typeof token !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Token is required' },
        { status: 400 }
      )
    }

    if (!password || typeof password !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Password is required' },
        { status: 400 }
      )
    }

    // Validate password strength
    const strengthCheck = validatePasswordStrength(password)
    if (!strengthCheck.valid) {
      return NextResponse.json(
        { success: false, error: strengthCheck.error },
        { status: 400 }
      )
    }

    // Validate token (try both types)
    let result = await validateToken(token, 'invite')
    if (!result.valid) {
      result = await validateToken(token, 'password_reset')
    }

    if (!result.valid || !result.userId) {
      return NextResponse.json(
        { success: false, error: result.error || 'Invalid token' },
        { status: 400 }
      )
    }

    // Hash the password
    const passwordHash = await hashPassword(password)

    // Update user
    await prisma.users.update({
      where: { ID: result.userId },
      data: {
        PasswordHash: passwordHash,
        Status: 'active',
        MustResetPassword: false,
        Password: null, // Clear legacy plaintext
      },
    })

    // Mark token as used
    await markTokenUsed(token)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Set password error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to set password' },
      { status: 500 }
    )
  }
}
