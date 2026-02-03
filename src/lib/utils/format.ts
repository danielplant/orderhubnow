/**
 * Formatting utilities for consistent display across server and client.
 *
 * IMPORTANT: All date/number formatting must use explicit locales to prevent
 * React hydration mismatches between server (Node) and client (browser).
 */

// =============================================================================
// Date Formatting
// =============================================================================

/**
 * Parse a date string as local midnight to avoid timezone shift.
 * "2026-01-20" → Jan 20 local time (not Jan 19 due to UTC interpretation)
 */
function parseLocalDate(date: Date | string): Date {
  if (date instanceof Date) return date
  // For date-only strings, append T00:00:00 to force local midnight
  // This prevents "2026-01-20" from being interpreted as UTC midnight
  // If string already has 'T', extract just the date part first
  const dateOnly = date.split('T')[0]
  return new Date(dateOnly + 'T00:00:00')
}

/**
 * Format a date as a short date string (e.g., "1/15/2026")
 * Uses en-US locale for consistent server/client rendering.
 */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '—'
  const d = parseLocalDate(date)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US')
}

/**
 * Format a date as ISO date string (e.g., "2026-01-15")
 * Useful for sortable/machine-readable display.
 */
export function formatDateISO(date: Date | string | null | undefined): string {
  if (!date) return '—'
  const d = parseLocalDate(date)
  if (isNaN(d.getTime())) return '—'
  // Use local date components to avoid timezone shift
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Format a date with time (e.g., "1/15/2026, 2:30 PM")
 */
export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return '—'
  const d = parseLocalDate(date)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-US', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

/**
 * Format a date as relative time (e.g., "2 days ago", "just now")
 */
export function formatRelativeDate(date: Date | string | null | undefined): string {
  if (!date) return '—'
  const d = parseLocalDate(date)
  if (isNaN(d.getTime())) return '—'

  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    if (diffHours === 0) {
      const diffMins = Math.floor(diffMs / (1000 * 60))
      if (diffMins < 1) return 'just now'
      return `${diffMins}m ago`
    }
    return `${diffHours}h ago`
  }
  if (diffDays === 1) return 'yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`

  return formatDate(d)
}

// =============================================================================
// Currency Formatting
// =============================================================================

/**
 * Format a number as currency (e.g., "$1,234.56")
 */
export function formatCurrency(
  amount: number | string | null | undefined,
  currency: 'USD' | 'CAD' = 'USD'
): string {
  if (amount === null || amount === undefined || amount === '') return '—'
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  if (isNaN(num)) return '—'

  return num.toLocaleString('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/**
 * Format a number as compact currency (e.g., "$1.2K")
 */
export function formatCurrencyCompact(
  amount: number | string | null | undefined,
  currency: 'USD' | 'CAD' = 'USD'
): string {
  if (amount === null || amount === undefined || amount === '') return '—'
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  if (isNaN(num)) return '—'

  return num.toLocaleString('en-US', {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  })
}

// =============================================================================
// Number Formatting
// =============================================================================

/**
 * Format a number with commas (e.g., "1,234")
 */
export function formatNumber(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '—'

  return num.toLocaleString('en-US')
}

/**
 * Format a number as percentage (e.g., "12.5%")
 */
export function formatPercent(
  value: number | string | null | undefined,
  decimals = 1
): string {
  if (value === null || value === undefined || value === '') return '—'
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '—'

  return num.toLocaleString('en-US', {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}
