/**
 * Email Client - SMTP via Nodemailer
 *
 * Matches .NET EmailsProcessing.cs SmtpClient configuration.
 * Uses standard SMTP - no third-party API signup required.
 *
 * Configuration: Database only (EmailSettings table via Admin UI)
 */

import nodemailer from 'nodemailer'
import type { EmailSettingsRecord } from '@/lib/types/settings'

// Cache for transporter - keyed by config hash
let _cachedTransporter: nodemailer.Transporter | null = null
let _cachedConfigHash: string | null = null

/**
 * Create a hash of SMTP config for cache invalidation.
 * Includes password in hash so changes are detected.
 */
function getConfigHash(config: EmailSettingsRecord): string {
  return `${config.SmtpHost}:${config.SmtpPort}:${config.SmtpUser}:${config.SmtpPassword}:${config.SmtpSecure}`
}

/**
 * Create a transporter from email settings (DB only).
 * Throws if DB settings are incomplete.
 */
function createTransporter(config: EmailSettingsRecord): nodemailer.Transporter {
  const host = config.SmtpHost
  const port = config.SmtpPort || 587
  const user = config.SmtpUser
  const pass = config.SmtpPassword
  const secure = config.SmtpSecure ?? false

  if (!host || !user || !pass) {
    throw new Error('SMTP configuration incomplete. Configure SMTP settings in Admin → Settings → Email.')
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  })
}

/**
 * Get or create a transporter using the provided config.
 * Caches transporter and invalidates when config changes.
 */
function getTransporterWithConfig(config: EmailSettingsRecord): nodemailer.Transporter {
  const configHash = getConfigHash(config)

  if (_cachedTransporter && _cachedConfigHash === configHash) {
    return _cachedTransporter
  }

  _cachedTransporter = createTransporter(config)
  _cachedConfigHash = configHash
  return _cachedTransporter
}

/**
 * Clear cached transporter to force re-creation with new settings.
 */
export function clearTransporterCache(): void {
  _cachedTransporter = null
  _cachedConfigHash = null
}

/**
 * Send email using config from database.
 */
export async function sendMailWithConfig(
  config: EmailSettingsRecord,
  options: nodemailer.SendMailOptions
): Promise<nodemailer.SentMessageInfo> {
  const transport = getTransporterWithConfig(config)
  return transport.sendMail(options)
}

/**
 * Test SMTP connection with provided config.
 * Returns true if connection successful, throws on error.
 */
export async function testSmtpConnection(config: EmailSettingsRecord): Promise<boolean> {
  const transport = createTransporter(config)
  await transport.verify()
  return true
}

