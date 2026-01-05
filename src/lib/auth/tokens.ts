/**
 * Auth Token Utilities
 *
 * Generates and validates secure tokens for invites and password resets.
 * Tokens are stored as SHA-256 hashes (never raw) per OWASP guidelines.
 */

import crypto from 'crypto'
import { prisma } from '@/lib/prisma'

const TOKEN_EXPIRY_HOURS = 24

export type TokenType = 'invite' | 'password_reset'

/**
 * Generate a cryptographically secure random token.
 * Returns a 64-character hex string.
 */
export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

/**
 * Hash a token using SHA-256 for secure storage.
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

/**
 * Create and store a token for a user.
 * Returns the raw token (to send in email) - we only store the hash.
 */
export async function createAuthToken(
  userId: number,
  tokenType: TokenType
): Promise<string> {
  const rawToken = generateToken()
  const tokenHash = hashToken(rawToken)

  const expiresAt = new Date()
  expiresAt.setHours(expiresAt.getHours() + TOKEN_EXPIRY_HOURS)

  // Invalidate any existing unused tokens of same type for this user
  await prisma.authTokens.updateMany({
    where: {
      UserID: userId,
      TokenType: tokenType,
      UsedAt: null,
    },
    data: {
      UsedAt: new Date(), // Mark as "used" to invalidate
    },
  })

  // Create new token
  await prisma.authTokens.create({
    data: {
      UserID: userId,
      TokenHash: tokenHash,
      TokenType: tokenType,
      ExpiresAt: expiresAt,
    },
  })

  return rawToken
}

/**
 * Validate a token and return the associated user ID if valid.
 * Does NOT mark the token as used - call markTokenUsed() after success.
 */
export async function validateToken(
  rawToken: string,
  expectedType: TokenType
): Promise<{
  valid: boolean
  userId?: number
  error?: string
}> {
  const tokenHash = hashToken(rawToken)

  const token = await prisma.authTokens.findFirst({
    where: {
      TokenHash: tokenHash,
      TokenType: expectedType,
    },
  })

  if (!token) {
    return { valid: false, error: 'Invalid or expired link' }
  }

  if (token.UsedAt) {
    return { valid: false, error: 'This link has already been used' }
  }

  if (new Date() > token.ExpiresAt) {
    return { valid: false, error: 'This link has expired' }
  }

  return { valid: true, userId: token.UserID }
}

/**
 * Mark a token as used (single-use enforcement).
 */
export async function markTokenUsed(rawToken: string): Promise<void> {
  const tokenHash = hashToken(rawToken)

  await prisma.authTokens.updateMany({
    where: { TokenHash: tokenHash },
    data: { UsedAt: new Date() },
  })
}

/**
 * Check rate limit: max 5 token requests per email per hour.
 */
export async function checkTokenRateLimit(userId: number): Promise<{
  allowed: boolean
  error?: string
}> {
  const oneHourAgo = new Date()
  oneHourAgo.setHours(oneHourAgo.getHours() - 1)

  const recentTokens = await prisma.authTokens.count({
    where: {
      UserID: userId,
      CreatedAt: { gte: oneHourAgo },
    },
  })

  if (recentTokens >= 5) {
    return {
      allowed: false,
      error: 'Too many requests. Please wait an hour before trying again.',
    }
  }

  return { allowed: true }
}

/**
 * Build the URL for a token link.
 */
export function buildTokenUrl(
  rawToken: string,
  tokenType: TokenType
): string {
  const baseUrl =
    process.env.APP_URL ||
    process.env.NEXTAUTH_URL ||
    'http://localhost:3000'

  if (tokenType === 'invite' || tokenType === 'password_reset') {
    return `${baseUrl}/set-password?token=${rawToken}`
  }

  return `${baseUrl}/set-password?token=${rawToken}`
}
