/**
 * Auth Email Sending Functions
 *
 * Sends invite and password reset emails using the SMTP transporter.
 */

import { transporter, EMAIL_FROM } from './client'
import { inviteRepHtml, passwordResetHtml, securityUpgradeHtml } from './auth-templates'
import { createAuthToken, buildTokenUrl, checkTokenRateLimit } from '@/lib/auth/tokens'
import { prisma } from '@/lib/prisma'

interface SendInviteResult {
  success: boolean
  inviteUrl?: string // For "Copy Invite Link" fallback
  error?: string
}

/**
 * Send invite email to a new rep.
 * Returns the invite URL for copy-link fallback.
 */
export async function sendRepInviteEmail(
  userId: number,
  repName: string,
  email: string
): Promise<SendInviteResult> {
  try {
    // Check rate limit
    const rateCheck = await checkTokenRateLimit(userId)
    if (!rateCheck.allowed) {
      return { success: false, error: rateCheck.error }
    }

    // Create token
    const rawToken = await createAuthToken(userId, 'invite')
    const inviteUrl = buildTokenUrl(rawToken, 'invite')

    // Send email
    await transporter.sendMail({
      from: EMAIL_FROM,
      to: email,
      subject: 'Set up your MyOrderHub account',
      html: inviteRepHtml({ repName, email, setPasswordUrl: inviteUrl }),
    })

    return { success: true, inviteUrl }
  } catch (error) {
    console.error('Failed to send invite email:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send email',
    }
  }
}

/**
 * Send password reset email.
 */
export async function sendPasswordResetEmail(
  userId: number,
  email: string
): Promise<SendInviteResult> {
  try {
    // Check rate limit
    const rateCheck = await checkTokenRateLimit(userId)
    if (!rateCheck.allowed) {
      return { success: false, error: rateCheck.error }
    }

    // Create token
    const rawToken = await createAuthToken(userId, 'password_reset')
    const resetUrl = buildTokenUrl(rawToken, 'password_reset')

    // Send email
    await transporter.sendMail({
      from: EMAIL_FROM,
      to: email,
      subject: 'Reset your MyOrderHub password',
      html: passwordResetHtml({ email, resetUrl }),
    })

    return { success: true, inviteUrl: resetUrl }
  } catch (error) {
    console.error('Failed to send reset email:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send email',
    }
  }
}

/**
 * Send security upgrade email to legacy user.
 */
export async function sendSecurityUpgradeEmail(
  userId: number,
  email: string
): Promise<SendInviteResult> {
  try {
    // Create token
    const rawToken = await createAuthToken(userId, 'password_reset')
    const resetUrl = buildTokenUrl(rawToken, 'password_reset')

    // Send email
    await transporter.sendMail({
      from: EMAIL_FROM,
      to: email,
      subject: 'MyOrderHub Security Upgrade - Action Required',
      html: securityUpgradeHtml({ email, resetUrl }),
    })

    return { success: true, inviteUrl: resetUrl }
  } catch (error) {
    console.error('Failed to send security upgrade email:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send email',
    }
  }
}

/**
 * Generate invite link without sending email (for copy-link fallback).
 */
export async function generateInviteLink(
  userId: number
): Promise<{ success: boolean; inviteUrl?: string; error?: string }> {
  try {
    const rawToken = await createAuthToken(userId, 'invite')
    const inviteUrl = buildTokenUrl(rawToken, 'invite')
    return { success: true, inviteUrl }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate link',
    }
  }
}

/**
 * Request password reset by email address.
 * Returns success even if email doesn't exist (to prevent enumeration).
 */
export async function requestPasswordReset(
  email: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Find user by email
    const user = await prisma.users.findFirst({
      where: {
        OR: [{ Email: email }, { LoginID: email }],
      },
    })

    // Always return success to prevent enumeration
    if (!user) {
      return { success: true }
    }

    // Check if disabled
    if (user.Status === 'disabled') {
      return { success: true } // Don't reveal account status
    }

    // Get email to send to
    const targetEmail = user.Email || user.LoginID
    if (!targetEmail || !targetEmail.includes('@')) {
      return { success: true } // No valid email, but don't reveal
    }

    // Check rate limit
    const rateCheck = await checkTokenRateLimit(user.ID)
    if (!rateCheck.allowed) {
      return { success: false, error: rateCheck.error }
    }

    // Send reset email
    await sendPasswordResetEmail(user.ID, targetEmail)

    return { success: true }
  } catch (error) {
    console.error('Password reset request failed:', error)
    return { success: true } // Don't reveal errors
  }
}
