import { prisma } from '@/lib/prisma'
import type { Customer, CustomersListResult } from '@/lib/types/customer'

/**
 * Get paginated list of customers with search.
 */
export async function getCustomers(input: {
  search?: string
  page: number
  pageSize: number
}): Promise<CustomersListResult> {
  const q = (input.search ?? '').trim()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = q
    ? {
        OR: [
          { StoreName: { contains: q } },
          { Email: { contains: q } },
          { CustomerName: { contains: q } },
          { Rep: { contains: q } },
        ],
      }
    : {}

  const [rows, total] = await Promise.all([
    prisma.customers.findMany({
      where,
      orderBy: { StoreName: 'asc' },
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
 */
export async function getRepNames(): Promise<Array<{ id: number; name: string }>> {
  const reps = await prisma.reps.findMany({
    orderBy: { Name: 'asc' },
    select: { ID: true, Name: true },
  })
  return reps.map((r) => ({ id: r.ID, name: r.Name }))
}
