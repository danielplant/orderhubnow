/**
 * Email Client - SMTP via Nodemailer
 *
 * Matches .NET EmailsProcessing.cs SmtpClient configuration.
 * Uses standard SMTP - no third-party API signup required.
 */

import nodemailer from 'nodemailer'

// Check if we're in a build/SSG context (no SMTP needed)
const isBuildTime = process.env.NODE_ENV === 'production' && !process.env.SMTP_HOST

// Create transporter lazily to avoid build-time errors
let _transporter: nodemailer.Transporter | null = null

function getTransporter(): nodemailer.Transporter {
  if (_transporter) return _transporter

  // Validate required environment variables
  const requiredEnvVars = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'EMAIL_FROM']
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`Missing required environment variable: ${envVar}`)
    }
  }

  // Create reusable SMTP transporter
  _transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT!, 10),
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for 587
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  })

  return _transporter
}

// Export getter instead of direct transporter (lazy initialization)
export const transporter = {
  sendMail: async (options: nodemailer.SendMailOptions) => {
    if (isBuildTime) {
      console.warn('Skipping email send during build time')
      return { messageId: 'build-time-skip' }
    }
    return getTransporter().sendMail(options)
  },
}

// Email addresses from config
export const EMAIL_FROM = process.env.EMAIL_FROM || 'orders@orderhub.com'
export const EMAIL_CC = process.env.EMAIL_CC || ''
export const EMAIL_SALES = process.env.EMAIL_SALES || ''
