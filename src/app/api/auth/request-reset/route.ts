import { NextResponse } from 'next/server'
import { requestPasswordReset } from '@/lib/email/send-auth-emails'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { email } = body

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Email is required' },
        { status: 400 }
      )
    }

    // Always returns success to prevent enumeration
    const result = await requestPasswordReset(email)

    if (!result.success && result.error) {
      // Only show rate limit errors
      if (result.error.includes('Too many requests')) {
        return NextResponse.json(
          { success: false, error: result.error },
          { status: 429 }
        )
      }
    }

    // Generic success response
    return NextResponse.json({
      success: true,
      message: 'If an account exists with that email, you will receive a password reset link.',
    })
  } catch (error) {
    console.error('Request reset error:', error)
    // Don't reveal errors
    return NextResponse.json({
      success: true,
      message: 'If an account exists with that email, you will receive a password reset link.',
    })
  }
}
