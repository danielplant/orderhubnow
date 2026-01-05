/**
 * Rep Context Utilities
 * 
 * Helpers for passing rep context through the buyer flow when reps create orders.
 * This enables reps to use the standard buyer journey while maintaining their
 * identity for order attribution.
 */

/**
 * Build a query string preserving rep context params.
 * Used throughout the buyer flow to maintain rep attribution.
 * 
 * @param searchParams - Current URL search params
 * @returns Query string with rep params (e.g., "?repId=123&returnTo=/rep/orders") or empty string
 */
export function buildRepQueryString(searchParams: URLSearchParams): string {
  const params = new URLSearchParams()
  
  const repId = searchParams.get('repId')
  const returnTo = searchParams.get('returnTo')
  
  if (repId) params.set('repId', repId)
  if (returnTo) params.set('returnTo', returnTo)
  
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

/**
 * Build rep context query string for server components.
 * Accepts a plain object from Next.js searchParams.
 * 
 * @param searchParams - Object from page props
 * @returns Query string with rep params or empty string
 */
export function buildRepQueryStringFromObject(
  searchParams: Record<string, string | string[] | undefined>
): string {
  const params = new URLSearchParams()
  
  const repId = typeof searchParams.repId === 'string' ? searchParams.repId : undefined
  const returnTo = typeof searchParams.returnTo === 'string' ? searchParams.returnTo : undefined
  
  if (repId) params.set('repId', repId)
  if (returnTo) params.set('returnTo', returnTo)
  
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

/**
 * Validate that a returnTo path is safe for redirection.
 * Prevents open redirect attacks by only allowing internal paths.
 * 
 * Rules:
 * - Must start with "/"
 * - Must NOT start with "//" (scheme-relative external URLs)
 * - Only /rep/* paths are honored (other paths fall back to confirmation)
 * 
 * @param returnTo - The path to validate
 * @returns true if safe to redirect to, false otherwise
 */
export function isValidReturnTo(returnTo: string | null | undefined): boolean {
  if (!returnTo) return false
  // Must be internal path, not scheme-relative external URL
  return returnTo.startsWith('/') && !returnTo.startsWith('//')
}

/**
 * Check if returnTo should redirect to rep portal.
 * Only /rep/* paths are honored for rep redirects.
 * 
 * @param returnTo - The validated path
 * @returns true if this is a rep portal redirect
 */
export function isRepPortalReturn(returnTo: string | null | undefined): boolean {
  return isValidReturnTo(returnTo) && returnTo!.startsWith('/rep')
}
