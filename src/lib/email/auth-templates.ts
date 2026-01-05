/**
 * Auth Email Templates
 *
 * HTML templates for invite and password reset emails.
 */

interface InviteEmailData {
  repName: string
  email: string
  setPasswordUrl: string
}

interface ResetEmailData {
  email: string
  resetUrl: string
}

/**
 * Email sent when admin creates a new rep.
 */
export function inviteRepHtml(data: InviteEmailData): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Set up your MyOrderHub account</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #f8f9fa; border-radius: 8px; padding: 32px; margin-bottom: 24px;">
    <h1 style="color: #1a1a1a; font-size: 24px; margin: 0 0 16px 0;">
      Welcome to MyOrderHub
    </h1>
    <p style="margin: 0 0 24px 0; font-size: 16px;">
      Hi ${escapeHtml(data.repName)},
    </p>
    <p style="margin: 0 0 24px 0; font-size: 16px;">
      You've been added as a sales rep on MyOrderHub. Click the button below to set your password and access your account.
    </p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${escapeHtml(data.setPasswordUrl)}" 
         style="display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 600; font-size: 16px;">
        Set Your Password
      </a>
    </div>
    <p style="margin: 0; font-size: 14px; color: #666;">
      This link expires in 24 hours. If you need a new link, contact your admin.
    </p>
  </div>
  
  <div style="font-size: 12px; color: #888; text-align: center;">
    <p style="margin: 0 0 8px 0;">
      If you didn't expect this email, you can safely ignore it.
    </p>
    <p style="margin: 0;">
      If the button doesn't work, copy and paste this link into your browser:<br>
      <span style="color: #2563eb; word-break: break-all;">${escapeHtml(data.setPasswordUrl)}</span>
    </p>
  </div>
</body>
</html>
`.trim()
}

/**
 * Email sent when user requests a password reset.
 */
export function passwordResetHtml(data: ResetEmailData): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset your MyOrderHub password</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #f8f9fa; border-radius: 8px; padding: 32px; margin-bottom: 24px;">
    <h1 style="color: #1a1a1a; font-size: 24px; margin: 0 0 16px 0;">
      Reset Your Password
    </h1>
    <p style="margin: 0 0 24px 0; font-size: 16px;">
      We received a request to reset the password for your MyOrderHub account.
    </p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${escapeHtml(data.resetUrl)}" 
         style="display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 600; font-size: 16px;">
        Reset Password
      </a>
    </div>
    <p style="margin: 0; font-size: 14px; color: #666;">
      This link expires in 24 hours. If you didn't request this, you can safely ignore this email.
    </p>
  </div>
  
  <div style="font-size: 12px; color: #888; text-align: center;">
    <p style="margin: 0;">
      If the button doesn't work, copy and paste this link into your browser:<br>
      <span style="color: #2563eb; word-break: break-all;">${escapeHtml(data.resetUrl)}</span>
    </p>
  </div>
</body>
</html>
`.trim()
}

/**
 * Email sent to existing users during security upgrade.
 */
export function securityUpgradeHtml(data: ResetEmailData): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MyOrderHub Security Upgrade</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #f8f9fa; border-radius: 8px; padding: 32px; margin-bottom: 24px;">
    <h1 style="color: #1a1a1a; font-size: 24px; margin: 0 0 16px 0;">
      Security Upgrade - Action Required
    </h1>
    <p style="margin: 0 0 16px 0; font-size: 16px;">
      We've upgraded the security on MyOrderHub to better protect your account.
    </p>
    <p style="margin: 0 0 24px 0; font-size: 16px;">
      Please set a new password to continue accessing your account. This only takes a minute.
    </p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${escapeHtml(data.resetUrl)}" 
         style="display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 600; font-size: 16px;">
        Set New Password
      </a>
    </div>
    <p style="margin: 0; font-size: 14px; color: #666;">
      Your orders and account data are not affected - this is just about your login security.
    </p>
  </div>
  
  <div style="font-size: 12px; color: #888; text-align: center;">
    <p style="margin: 0;">
      If the button doesn't work, copy and paste this link into your browser:<br>
      <span style="color: #2563eb; word-break: break-all;">${escapeHtml(data.resetUrl)}</span>
    </p>
  </div>
</body>
</html>
`.trim()
}

/**
 * Escape HTML to prevent XSS in email templates.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
