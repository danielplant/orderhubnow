/**
 * Email Validation Utilities
 */

/**
 * Check if a string is a valid email format
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false
  const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return pattern.test(email.trim())
}

/**
 * Get validation message for an email address
 * Returns null if valid, error message if invalid
 */
export function getEmailValidationMessage(email: string | undefined | null): string | null {
  if (!email || !email.trim()) return 'No email address provided'
  if (!isValidEmail(email)) return 'Invalid email format'
  return null
}

/**
 * Sanitize email for display (trim whitespace)
 */
export function sanitizeEmail(email: string | undefined | null): string {
  return email?.trim() || ''
}
