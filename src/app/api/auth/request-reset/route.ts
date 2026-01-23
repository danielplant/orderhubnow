/**
 * POST /api/auth/request-reset
 *
 * Initiates password reset flow:
 * 1. Validates email
 * 2. Looks up user
 * 3. Creates password_reset token
 * 4. Sends email with reset link
 *
 * Returns success: true even if user not found (security: no user enumeration)
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createAuthToken, checkTokenRateLimit, buildTokenUrl } from '@/lib/auth/tokens'
import { sendMailWithConfig } from '@/lib/email/client'
import { getEmailSettings } from '@/lib/data/queries/settings'
import { logEmailSent, logEmailResult } from '@/lib/audit/activity-logger'

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

    const normalizedEmail = email.trim().toLowerCase()

    // Look up user by email
    const user = await prisma.users.findFirst({
      where: {
        Email: normalizedEmail,
      },
      select: { ID: true, Email: true, LoginID: true },
    })

    // Always return success to prevent user enumeration
    if (!user) {
      console.log(`Password reset requested for non-existent email: ${normalizedEmail}`)
      return NextResponse.json({ success: true })
    }

    // Check rate limit
    const rateLimit = await checkTokenRateLimit(user.ID)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: rateLimit.error },
        { status: 429 }
      )
    }

    // Create password reset token
    const rawToken = await createAuthToken(user.ID, 'password_reset')
    const resetUrl = buildTokenUrl(rawToken, 'password_reset')

    // Fetch email settings (DB only)
    const emailSettings = await getEmailSettings()
    if (!emailSettings.FromEmail) {
      console.error('Password reset email skipped: FromEmail not configured in database')
      return NextResponse.json({ success: true }) // Don't reveal config issues
    }
    const fromEmail = emailSettings.FromEmail
    const fromAddress = emailSettings.FromName
      ? `"${emailSettings.FromName}" <${fromEmail}>`
      : fromEmail

    // Send reset email
    try {
      await sendMailWithConfig(emailSettings, {
        from: fromAddress,
        to: user.Email!,
        subject: 'Password Reset Request',
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Password Reset</h2>
            <p>Hi,</p>
            <p>You requested a password reset. Click the link below to set a new password:</p>
            <p style="margin: 24px 0;">
              <a href="${resetUrl}" style="background-color: #0066cc; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">
                Reset Password
              </a>
            </p>
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #666;">${resetUrl}</p>
            <p style="margin-top: 24px; color: #666; font-size: 14px;">
              This link will expire in 24 hours. If you didn't request this, you can safely ignore this email.
            </p>
          </div>
        `,
      })

      // Log the email send (non-blocking)
      logEmailSent({
        entityType: 'user',
        entityId: user.ID.toString(),
        emailType: 'password_reset',
        recipient: user.Email!,
      }).catch((err) => console.error('Failed to log password reset email:', err))
    } catch (emailError) {
      // Log the failed send (non-blocking)
      const errorMessage = emailError instanceof Error ? emailError.message : 'Unknown error'
      logEmailResult({
        entityType: 'user',
        entityId: user.ID.toString(),
        emailType: 'password_reset',
        recipient: user.Email!,
        status: 'failed',
        errorMessage,
      }).catch((err) => console.error('Failed to log password reset email failure:', err))

      console.error('Password reset email failed:', errorMessage)
      // Don't reveal email failures to user (security)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Request reset error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to process request' },
      { status: 500 }
    )
  }
}
