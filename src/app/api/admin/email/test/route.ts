/**
 * Test Email API Endpoint
 *
 * Sends a test email to verify SMTP configuration.
 * Requires admin authentication.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/providers'
import { getEmailSettings } from '@/lib/data/queries/settings'
import { sendMailWithConfig, testSmtpConnection } from '@/lib/email/client'
import { isValidEmail } from '@/lib/utils/email'
import { logEmailResult } from '@/lib/audit/activity-logger'

export async function POST(request: NextRequest) {
  // Capture session and recipient early for use in error logging
  let session: { user?: { id?: string; email?: string | null; name?: string | null; role?: string } } | null = null
  let recipientEmail = ''
  let performedBy = 'admin'

  try {
    // Require admin auth
    session = await auth()
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }
    performedBy = session.user.email || session.user.name || 'admin'

    const body = await request.json()
    const { to } = body
    recipientEmail = to || ''

    if (!to || typeof to !== 'string') {
      return NextResponse.json({ success: false, error: 'Email address is required' }, { status: 400 })
    }

    if (!isValidEmail(to)) {
      return NextResponse.json({ success: false, error: 'Invalid email address format' }, { status: 400 })
    }

    // Get email settings from database
    const config = await getEmailSettings()

    // First verify connection
    try {
      await testSmtpConnection(config)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return NextResponse.json({
        success: false,
        error: `SMTP connection failed: ${message}`,
      })
    }

    // Validate required config (DB only)
    if (!config.FromEmail) {
      return NextResponse.json({
        success: false,
        error: 'From email not configured. Set in Admin → Settings → Email.',
      })
    }

    // Send test email
    const fromEmail = config.FromEmail
    const fromName = config.FromName || 'MyOrderHub'
    const fromAddress = `"${fromName}" <${fromEmail}>`

    const result = await sendMailWithConfig(config, {
      from: fromAddress,
      to: to,
      subject: 'Test Email from MyOrderHub',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Test Email</h2>
          <p>This is a test email from MyOrderHub to verify your SMTP configuration is working correctly.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="color: #666; font-size: 14px;">
            Sent from: ${fromAddress}<br>
            SMTP Host: ${config.SmtpHost || 'Not configured'}<br>
            Time: ${new Date().toISOString()}
          </p>
        </div>
      `,
    })

    // Log successful test email (non-blocking)
    logEmailResult({
      entityType: 'user',
      entityId: session.user.id || '0',
      emailType: 'test_email',
      recipient: to,
      status: 'sent',
      performedBy,
    }).catch((err) => console.error('Failed to log test email:', err))

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
    })
  } catch (error) {
    console.error('Test email error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'

    // Log failed test email (non-blocking)
    if (recipientEmail) {
      logEmailResult({
        entityType: 'user',
        entityId: session?.user?.id || '0',
        emailType: 'test_email',
        recipient: recipientEmail,
        status: 'failed',
        errorMessage: message,
        performedBy,
      }).catch((err) => console.error('Failed to log test email failure:', err))
    }

    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
