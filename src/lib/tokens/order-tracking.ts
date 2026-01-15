/**
 * Order Tracking Token Service
 * 
 * Generates and verifies signed JWT tokens for public order tracking.
 * Tokens are included in shipment emails so customers can track their orders.
 */

import jwt from 'jsonwebtoken'

const SECRET = process.env.ORDER_TRACKING_SECRET || process.env.NEXTAUTH_SECRET || 'fallback-secret-change-in-production'
const TOKEN_EXPIRY = '90d' // 90 days

interface TrackingTokenPayload {
  orderId: string
  email: string
  iat?: number
  exp?: number
}

/**
 * Generate a signed tracking token for an order
 */
export function generateTrackingToken(orderId: string, email: string): string {
  const payload: TrackingTokenPayload = {
    orderId,
    email: email.toLowerCase(),
  }
  
  return jwt.sign(payload, SECRET, { expiresIn: TOKEN_EXPIRY })
}

/**
 * Verify and decode a tracking token
 * Returns null if token is invalid or expired
 */
export function verifyTrackingToken(token: string): { orderId: string; email: string } | null {
  try {
    const decoded = jwt.verify(token, SECRET) as TrackingTokenPayload
    return {
      orderId: decoded.orderId,
      email: decoded.email,
    }
  } catch {
    return null
  }
}

/**
 * Generate the full tracking URL for an order
 */
export function getTrackingUrl(orderId: string, email: string): string {
  const token = generateTrackingToken(orderId, email)
  const baseUrl = process.env.APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000'
  return `${baseUrl}/buyer/track/${token}`
}

/**
 * Check if a token is valid without fully decoding
 */
export function isValidToken(token: string): boolean {
  return verifyTrackingToken(token) !== null
}
