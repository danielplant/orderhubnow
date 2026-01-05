import { NextResponse } from 'next/server'
import { validateToken } from '@/lib/auth/tokens'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { token } = body

    if (!token || typeof token !== 'string') {
      return NextResponse.json(
        { valid: false, error: 'Token is required' },
        { status: 400 }
      )
    }

    // Validate for either invite or password_reset
    let result = await validateToken(token, 'invite')
    if (!result.valid) {
      result = await validateToken(token, 'password_reset')
    }

    if (!result.valid) {
      return NextResponse.json(
        { valid: false, error: result.error },
        { status: 200 }
      )
    }

    return NextResponse.json({ valid: true })
  } catch (error) {
    console.error('Token validation error:', error)
    return NextResponse.json(
      { valid: false, error: 'Validation failed' },
      { status: 500 }
    )
  }
}
