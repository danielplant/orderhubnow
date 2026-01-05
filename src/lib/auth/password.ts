/**
 * Password Hashing Utilities
 *
 * Uses bcryptjs for password hashing (pure JS, works on Vercel).
 * Cost factor 12 is OWASP recommended minimum.
 */

import bcrypt from 'bcryptjs'

const COST_FACTOR = 12

/**
 * Hash a plaintext password using bcrypt.
 */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST_FACTOR)
}

/**
 * Verify a plaintext password against a bcrypt hash.
 */
export async function verifyPassword(
  plain: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

/**
 * Check if a password meets minimum requirements.
 * NIST guidelines: minimum 8 chars, allow long passphrases.
 */
export function validatePasswordStrength(password: string): {
  valid: boolean
  error?: string
} {
  if (!password || password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters' }
  }

  if (password.length > 128) {
    return { valid: false, error: 'Password must be less than 128 characters' }
  }

  // Check for common weak passwords
  const commonPasswords = [
    'password',
    '12345678',
    'password1',
    'qwerty123',
    'letmein1',
  ]
  if (commonPasswords.includes(password.toLowerCase())) {
    return { valid: false, error: 'This password is too common' }
  }

  return { valid: true }
}
