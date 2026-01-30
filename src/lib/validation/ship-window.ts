/**
 * Ship window validation utilities.
 *
 * Core rule: Ship dates CANNOT be earlier than collection's approved window.
 * Later dates are always allowed.
 *
 * Date format: All dates use ISO string format (YYYY-MM-DD) to match
 * existing codebase patterns.
 */

export interface CollectionWindow {
  id: number
  name: string
  shipWindowStart: string | null // ISO date string (YYYY-MM-DD)
  shipWindowEnd: string | null // ISO date string (YYYY-MM-DD)
}

export interface ValidationError {
  field: 'start' | 'end'
  message: string
  collectionName: string
  minAllowedDate: string // ISO date string (YYYY-MM-DD)
}

export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
  warnings: string[]
}

/**
 * Parse ISO date string safely (avoids timezone issues).
 * Interprets the date as local midnight.
 */
export function parseDate(isoDateString: string): Date {
  return new Date(isoDateString + 'T00:00:00')
}

/**
 * Format Date to ISO date string (YYYY-MM-DD).
 */
export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

/**
 * Get default ship dates for ATS orders.
 * ATS orders have no collection constraints - default is today + 14 days.
 */
export function getATSDefaultDates(): { start: string; end: string } {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const twoWeeksOut = new Date(today)
  twoWeeksOut.setDate(twoWeeksOut.getDate() + 14)
  return {
    start: formatDate(today),
    end: formatDate(twoWeeksOut),
  }
}

/**
 * Validate ship dates against collection windows.
 *
 * For PreOrder: validates against all collection windows.
 * For ATS: pass empty collections array (skips validation).
 */
export function validateShipDates(
  shipStart: string,
  shipEnd: string,
  collections: CollectionWindow[]
): ValidationResult {
  const errors: ValidationError[] = []
  const warnings: string[] = []

  const startDate = parseDate(shipStart)
  const endDate = parseDate(shipEnd)

  // Basic validation: end must be >= start
  if (endDate < startDate) {
    errors.push({
      field: 'end',
      message: 'Ship end date must be on or after start date',
      collectionName: '',
      minAllowedDate: shipStart,
    })
  }

  // No collections = ATS order or uncategorized items (no validation needed)
  if (collections.length === 0) {
    warnings.push('No collections to validate against')
    return { valid: errors.length === 0, errors, warnings }
  }

  for (const collection of collections) {
    // Check start date against collection minimum
    if (collection.shipWindowStart) {
      const collectionStart = parseDate(collection.shipWindowStart)
      if (startDate < collectionStart) {
        errors.push({
          field: 'start',
          message: `Cannot be before ${collection.name}'s ship window`,
          collectionName: collection.name,
          minAllowedDate: collection.shipWindowStart,
        })
      }
    } else {
      warnings.push(`${collection.name} has no ship window start date`)
    }

    // Check end date against collection minimum
    if (collection.shipWindowEnd) {
      const collectionEnd = parseDate(collection.shipWindowEnd)
      if (endDate < collectionEnd) {
        errors.push({
          field: 'end',
          message: `Cannot be before ${collection.name}'s ship window end`,
          collectionName: collection.name,
          minAllowedDate: collection.shipWindowEnd,
        })
      }
    } else {
      warnings.push(`${collection.name} has no ship window end date`)
    }
  }

  return { valid: errors.length === 0, errors, warnings }
}

/**
 * Get minimum allowed dates from collections (most restrictive).
 * Returns the LATEST start and LATEST end across all collections.
 *
 * Returns null values if no collections have dates configured.
 * UI should default to today when null.
 */
export function getMinimumAllowedDates(collections: CollectionWindow[]): {
  minStart: string | null
  minEnd: string | null
} {
  const starts = collections.map((c) => c.shipWindowStart).filter((d): d is string => d !== null)

  const ends = collections.map((c) => c.shipWindowEnd).filter((d): d is string => d !== null)

  if (starts.length === 0 && ends.length === 0) {
    return { minStart: null, minEnd: null }
  }

  // Find the latest (most restrictive) dates
  const latestStart = starts.length > 0 ? starts.reduce((a, b) => (a > b ? a : b)) : null

  const latestEnd = ends.length > 0 ? ends.reduce((a, b) => (a > b ? a : b)) : null

  return { minStart: latestStart, minEnd: latestEnd }
}

/**
 * Check if two collection windows overlap.
 */
export function windowsOverlap(a: CollectionWindow, b: CollectionWindow): boolean {
  if (!a.shipWindowStart || !a.shipWindowEnd || !b.shipWindowStart || !b.shipWindowEnd) {
    return false
  }
  // Overlap exists if: A starts before B ends AND A ends after B starts
  return a.shipWindowStart <= b.shipWindowEnd && a.shipWindowEnd >= b.shipWindowStart
}

/**
 * Get intersection of two overlapping windows.
 * Returns null if no overlap.
 */
export function getOverlapWindow(
  a: CollectionWindow,
  b: CollectionWindow
): { start: string; end: string } | null {
  if (!windowsOverlap(a, b)) return null
  return {
    // Latest start
    start: a.shipWindowStart! > b.shipWindowStart! ? a.shipWindowStart! : b.shipWindowStart!,
    // Earliest end
    end: a.shipWindowEnd! < b.shipWindowEnd! ? a.shipWindowEnd! : b.shipWindowEnd!,
  }
}

/**
 * Get intersection of multiple collection windows.
 * Returns null if any pair doesn't overlap or any collection lacks complete windows.
 *
 * Note: All collections must have complete windows for overlap calculation.
 */
export function getMultiCollectionOverlap(
  collections: CollectionWindow[]
): { start: string; end: string } | null {
  if (collections.length === 0) return null

  if (collections.length === 1) {
    const c = collections[0]
    if (!c.shipWindowStart || !c.shipWindowEnd) return null
    return { start: c.shipWindowStart, end: c.shipWindowEnd }
  }

  let result = getOverlapWindow(collections[0], collections[1])
  if (!result) return null

  for (let i = 2; i < collections.length; i++) {
    const c = collections[i]
    if (!c.shipWindowStart || !c.shipWindowEnd) return null

    // Check if current result overlaps with next collection
    if (result.start > c.shipWindowEnd || result.end < c.shipWindowStart) {
      return null // No overlap
    }

    // Narrow the window
    result = {
      start: result.start > c.shipWindowStart ? result.start : c.shipWindowStart,
      end: result.end < c.shipWindowEnd ? result.end : c.shipWindowEnd,
    }
  }

  return result
}
