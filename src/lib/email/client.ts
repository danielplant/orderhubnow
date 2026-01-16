/**
 * Email Client - SMTP via Nodemailer
 *
 * Matches .NET EmailsProcessing.cs SmtpClient configuration.
 * Uses standard SMTP - no third-party API signup required.
 *
 * Configuration priority:
 * 1. Database (EmailSettings table)
 * 2. Environment variables (.env)
 */

import nodemailer from 'nodemailer'
import type { EmailSettingsRecord } from '@/lib/types/settings'

// Check if we're in a build/SSG context (no SMTP needed)
const isBuildTime = process.env.NODE_ENV === 'production' && !process.env.SMTP_HOST

// Cache for transporter - keyed by config hash
let _cachedTransporter: nodemailer.Transporter | null = null
let _cachedConfigHash: string | null = null

/**
 * Create a hash of SMTP config for cache invalidation.
 */
function getConfigHash(config: EmailSettingsRecord): string {
  return `${config.SmtpHost}:${config.SmtpPort}:${config.SmtpUser}:${config.SmtpSecure}`
}

/**
 * Create a transporter from email settings.
 * Falls back to env vars if DB settings are incomplete.
 */
function createTransporter(config: EmailSettingsRecord): nodemailer.Transporter {
  // Use DB config if available, otherwise fall back to env
  const host = config.SmtpHost || process.env.SMTP_HOST
  const port = config.SmtpPort || (process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587)
  const user = config.SmtpUser || process.env.SMTP_USER
  const pass = config.SmtpPassword || process.env.SMTP_PASSWORD
  const secure = config.SmtpSecure ?? (process.env.SMTP_SECURE === 'true')

  if (!host || !user || !pass) {
    throw new Error('SMTP configuration incomplete. Set via Admin Settings or environment variables.')
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
 * Legacy synchronous transporter for backward compatibility.
 * Uses only environment variables.
 */
function getLegacyTransporter(): nodemailer.Transporter {
  if (_cachedTransporter) return _cachedTransporter

  const requiredEnvVars = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD']
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`Missing required environment variable: ${envVar}`)
    }
  }

  _cachedTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT!, 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  })

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
 * Send email using config from database or environment.
 */
export async function sendMailWithConfig(
  config: EmailSettingsRecord,
  options: nodemailer.SendMailOptions
): Promise<nodemailer.SentMessageInfo> {
  if (isBuildTime) {
    console.warn('Skipping email send during build time')
    return { messageId: 'build-time-skip' }
  }

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

// Legacy transporter export for backward compatibility
// Used by code that doesn't pass config explicitly
export const transporter = {
  sendMail: async (options: nodemailer.SendMailOptions) => {
    if (isBuildTime) {
      console.warn('Skipping email send during build time')
      return { messageId: 'build-time-skip' }
    }
    return getLegacyTransporter().sendMail(options)
  },
}

// Email addresses from env config (legacy)
export const EMAIL_FROM = process.env.EMAIL_FROM || 'orders@orderhub.com'
export const EMAIL_CC = process.env.EMAIL_CC || ''
export const EMAIL_SALES = process.env.EMAIL_SALES || ''
