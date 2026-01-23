import type { Session } from 'next-auth'
import type { UserRole } from '@/lib/types/auth'

/**
 * Validates a callback URL against the user's role and returns a safe redirect path.
 *
 * - Rejects external URLs (must start with / but not //)
 * - Rejects /login to prevent redirect loops
 * - Validates callback matches user's role permissions
 * - Falls back to role default if invalid
 */
export function getValidCallbackForRole(
  callbackUrl: string | null | undefined,
  role: UserRole
): string {
  const roleDefault = role === 'admin' ? '/admin' : '/rep'

  // Reject if not internal path
  if (!callbackUrl || !callbackUrl.startsWith('/') || callbackUrl.startsWith('//')) {
    return roleDefault
  }

  // Reject /login to prevent loops
  if (callbackUrl === '/login' || callbackUrl.startsWith('/login?')) {
    return roleDefault
  }

  // Role-specific allowlist
  if (role === 'admin') {
    // Admin can access /admin/* (includes /admin/dev/*)
    if (callbackUrl.startsWith('/admin')) {
      return callbackUrl
    }
    // Allow /rep with adminViewAs for view-as deep links
    if (callbackUrl.startsWith('/rep') && callbackUrl.includes('adminViewAs=')) {
      return callbackUrl
    }
  } else if (role === 'rep') {
    // Rep can access /rep/*
    if (callbackUrl.startsWith('/rep')) {
      return callbackUrl
    }
  }

  // Role mismatch or invalid path → use role default
  return roleDefault
}

/**
 * Resolves the effective repId for data queries.
 *
 * - For admins in view-as mode: returns the adminViewAs param
 * - For admins without view-as: returns null (should not see rep data)
 * - For reps: returns their session repId
 */
export function getEffectiveRepId(
  session: Session | null,
  searchParams: URLSearchParams | { get: (key: string) => string | null }
): number | null {
  if (!session?.user) {
    return null
  }

  const role = session.user.role as UserRole

  if (role === 'admin') {
    const viewAs = searchParams.get('adminViewAs')
    if (viewAs) {
      const parsed = parseInt(viewAs, 10)
      return isNaN(parsed) ? null : parsed
    }
    // Admin without view-as shouldn't see rep data
    return null
  }

  // Rep user → use their session repId
  return session.user.repId ?? null
}

/**
 * Checks if the current session is in admin view-as mode.
 */
export function isViewAsMode(
  session: Session | null,
  searchParams: URLSearchParams | { get: (key: string) => string | null }
): boolean {
  if (!session?.user) {
    return false
  }

  const role = session.user.role as UserRole
  if (role !== 'admin') {
    return false
  }

  const viewAs = searchParams.get('adminViewAs')
  return !!viewAs
}

/**
 * Builds a rep portal href with view-as params preserved.
 */
export function buildRepHref(
  path: string,
  viewAsParams?: { repId: string; repName?: string } | null
): string {
  if (!viewAsParams) {
    return path
  }

  const params = new URLSearchParams()
  params.set('adminViewAs', viewAsParams.repId)
  if (viewAsParams.repName) {
    params.set('repName', viewAsParams.repName)
  }

  const separator = path.includes('?') ? '&' : '?'
  return `${path}${separator}${params.toString()}`
}
