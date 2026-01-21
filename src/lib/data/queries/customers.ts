import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import type { Customer, CustomersListResult } from '@/lib/types/customer'

// ============================================================================
// Types for Customers List Sorting
// ============================================================================

export type CustomerSortField = 'storeName' | 'country' | 'state' | 'rep'
export type SortDirection = 'asc' | 'desc'

// Map UI column IDs to database field names
const CUSTOMERS_SORT_FIELDS: Record<CustomerSortField, string> = {
  storeName: 'StoreName',
  country: 'Country',
  state: 'StateProvince',
  rep: 'Rep',
}

/**
 * Get paginated list of customers with search.
 * Search includes rep name lookup: if search matches a rep's name,
 * customers with that rep's code are also returned.
 */
export async function getCustomers(input: {
  search?: string
  page: number
  pageSize: number
  sortBy?: CustomerSortField
  sortDir?: SortDirection
}): Promise<CustomersListResult> {
  const q = (input.search ?? '').trim()

  let where: Prisma.CustomersWhereInput = {}

  if (q) {
    // Find rep codes that match the search term (by rep name)
    // This allows searching by rep name to find customers with that rep's code
    const matchingReps = await prisma.reps.findMany({
      where: { Name: { contains: q } },
      select: { Code: true, Name: true },
    })
    // Get the codes (with fallback to name if code is empty)
    const repCodes = matchingReps
      .map((r) => r.Code?.trim() || r.Name || '')
      .filter(Boolean)

    const orConditions: Prisma.CustomersWhereInput[] = [
      { StoreName: { contains: q } },
      { Email: { contains: q } },
      { CustomerName: { contains: q } },
      { Rep: { contains: q } }, // Direct code/value match
    ]

    // Add rep code matches from name lookup
    if (repCodes.length > 0) {
      orConditions.push({ Rep: { in: repCodes } })
    }

    where = { OR: orConditions }
  }

  // Build dynamic orderBy based on sort params
  const sortField = CUSTOMERS_SORT_FIELDS[input.sortBy ?? 'storeName']
  const sortDir = input.sortDir ?? 'asc'

  const [rows, total] = await Promise.all([
    prisma.customers.findMany({
      where,
      orderBy: { [sortField]: sortDir },
      skip: (Math.max(1, input.page) - 1) * input.pageSize,
      take: input.pageSize,
    }),
    prisma.customers.count({ where }),
  ])

  const customers: Customer[] = rows.map((r) => ({
    id: r.ID,
    storeName: r.StoreName,
    email: r.Email ?? null,
    customerName: r.CustomerName ?? null,
    phone: r.Phone ?? null,
    rep: r.Rep ?? null,
    address: {
      street1: r.Street1 ?? null,
      street2: r.Street2 ?? null,
      city: r.City ?? null,
      stateProvince: r.StateProvince ?? null,
      zipPostal: r.ZipPostal ?? null,
      country: r.Country ?? null,
    },
    shippingAddress: {
      street1: r.ShippingStreet1 ?? null,
      street2: r.ShippingStreet2 ?? null,
      city: r.ShippingCity ?? null,
      stateProvince: r.ShippingStateProvince ?? null,
      zipPostal: r.ShippingZipPostal ?? null,
      country: r.ShippingCountry ?? null,
    },
    website: r.Website ?? null,
    additionalInfo: r.AdditionalInfo ?? null,
  }))

  return { customers, total }
}

/**
 * Get a single customer by ID.
 */
export async function getCustomerById(id: number): Promise<Customer | null> {
  const row = await prisma.customers.findUnique({
    where: { ID: id },
  })

  if (!row) return null

  return {
    id: row.ID,
    storeName: row.StoreName,
    email: row.Email ?? null,
    customerName: row.CustomerName ?? null,
    phone: row.Phone ?? null,
    rep: row.Rep ?? null,
    address: {
      street1: row.Street1 ?? null,
      street2: row.Street2 ?? null,
      city: row.City ?? null,
      stateProvince: row.StateProvince ?? null,
      zipPostal: row.ZipPostal ?? null,
      country: row.Country ?? null,
    },
    shippingAddress: {
      street1: row.ShippingStreet1 ?? null,
      street2: row.ShippingStreet2 ?? null,
      city: row.ShippingCity ?? null,
      stateProvince: row.ShippingStateProvince ?? null,
      zipPostal: row.ShippingZipPostal ?? null,
      country: row.ShippingCountry ?? null,
    },
    website: row.Website ?? null,
    additionalInfo: row.AdditionalInfo ?? null,
  }
}

/**
 * Get list of available reps for customer assignment dropdown.
 * Returns id, name, and code (with fallback to Name if Code is empty).
 */
export async function getRepNames(): Promise<Array<{ id: number; name: string; code: string }>> {
  const reps = await prisma.reps.findMany({
    orderBy: { Name: 'asc' },
    select: { ID: true, Name: true, Code: true },
  })
  return reps.map((r) => ({
    id: r.ID,
    name: r.Name ?? '',
    code: r.Code?.trim() || r.Name || '',  // Fallback: Code empty -> use Name
  }))
}
