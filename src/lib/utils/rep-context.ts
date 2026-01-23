/**
 * Rep Context Utilities
 * 
 * Helpers for passing rep context through the buyer flow when reps create orders.
 * This enables reps to use the standard buyer journey while maintaining their
 * identity for order attribution.
 */

/**
 * Build a query string preserving rep context params and edit order context.
 * Used throughout the buyer flow to maintain rep attribution and edit state.
 *
 * @param searchParams - Current URL search params
 * @returns Query string with context params (e.g., "?repId=123&repName=Jane%20Doe&returnTo=/rep/orders&editOrder=456") or empty string
 */
export function buildRepQueryString(searchParams: URLSearchParams): string {
  const params = new URLSearchParams()

  const repId = searchParams.get('repId')
  const repName = normalizeRepName(searchParams.get('repName'))
  const returnTo = searchParams.get('returnTo')
  const editOrder = searchParams.get('editOrder')

  if (repId) params.set('repId', repId)
  if (repName) params.set('repName', repName)
  if (returnTo && isValidPortalReturn(returnTo)) params.set('returnTo', returnTo)
  if (editOrder) params.set('editOrder', editOrder)

  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

/**
 * Build rep context query string for server components.
 * Accepts a plain object from Next.js searchParams.
 *
 * @param searchParams - Object from page props
 * @returns Query string with context params or empty string
 */
export function buildRepQueryStringFromObject(
  searchParams: Record<string, string | string[] | undefined>
): string {
  const params = new URLSearchParams()

  const repId = typeof searchParams.repId === 'string' ? searchParams.repId : undefined
  const repName = normalizeRepName(
    typeof searchParams.repName === 'string' ? searchParams.repName : undefined
  )
  const returnTo = typeof searchParams.returnTo === 'string' ? searchParams.returnTo : undefined
  const editOrder = typeof searchParams.editOrder === 'string' ? searchParams.editOrder : undefined

  if (repId) params.set('repId', repId)
  if (repName) params.set('repName', repName)
  if (returnTo && isValidPortalReturn(returnTo)) params.set('returnTo', returnTo)
  if (editOrder) params.set('editOrder', editOrder)

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
 * Check if returnTo should redirect to a portal (rep or admin).
 *
 * @param returnTo - The validated path
 * @returns true if this is a portal redirect
 */
export function isValidPortalReturn(returnTo: string | null | undefined): boolean {
  return (
    isValidReturnTo(returnTo) &&
    (returnTo!.startsWith('/rep') || returnTo!.startsWith('/admin'))
  )
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

/**
 * Get a human-friendly portal label for a validated returnTo path.
 */
export function getPortalReturnLabel(returnTo: string): string {
  if (returnTo.startsWith('/admin')) return 'Return to Admin Portal'
  if (returnTo.startsWith('/rep')) return 'Return to Rep Portal'
  return 'Return to Portal'
}

/**
 * Get a safe returnTo value, falling back to /rep/orders if invalid.
 * Use this to guarantee a valid redirect destination.
 *
 * @param returnTo - The path to validate
 * @returns A safe returnTo path (either the validated input or /rep/orders)
 */
export function getSafeReturnTo(returnTo: string | null | undefined): string {
  return isValidPortalReturn(returnTo) ? returnTo! : '/rep/orders'
}

/**
 * Normalize rep name for query string use.
 */
export function normalizeRepName(repName: string | null | undefined): string | null {
  if (!repName) return null
  const trimmed = repName.trim().replace(/\s+/g, ' ')
  if (!trimmed) return null
  return trimmed.length > 80 ? trimmed.slice(0, 80) : trimmed
}
