'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import type { CustomerInput } from '@/lib/types/customer'

// ============================================================================
// Customer Lookup (for buyer order form autocomplete)
// ============================================================================

/**
 * Suggest store names matching a prefix for autocomplete.
 * Used in buyer order form to find existing customers.
 */
export interface StoreSuggestion {
  id: number
  storeName: string
}

export async function suggestStoreNames(prefix: string): Promise<StoreSuggestion[]> {
  // Require at least 3 chars to avoid too many results
  if (!prefix || prefix.trim().length < 3) {
    return []
  }

  const trimmedPrefix = prefix.trim()

  const customers = await prisma.customers.findMany({
    where: {
      StoreName: {
        startsWith: trimmedPrefix,
        // SQL Server collation is case-insensitive by default
      },
    },
    select: {
      ID: true,
      StoreName: true,
    },
    orderBy: { StoreName: 'asc' },
    take: 10,
  })

  return customers.map((c) => ({
    id: c.ID,
    storeName: c.StoreName ?? '',
  }))
}

/**
 * Customer data for auto-filling the order form.
 */
export interface CustomerAutoFill {
  id: number
  storeName: string
  buyerName: string | null
  email: string | null
  phone: string | null
  website: string | null
  rep: string | null
  // Billing address
  street1: string | null
  street2: string | null
  city: string | null
  stateProvince: string | null
  zipPostal: string | null
  country: string | null
  // Shipping address
  shippingStreet1: string | null
  shippingStreet2: string | null
  shippingCity: string | null
  shippingStateProvince: string | null
  shippingZipPostal: string | null
  shippingCountry: string | null
}

/**
 * Get customer details for auto-filling the order form.
 * Returns null if customer not found.
 */
export async function getCustomerForAutoFill(customerId: number): Promise<CustomerAutoFill | null> {
  const customer = await prisma.customers.findUnique({
    where: { ID: customerId },
    select: {
      ID: true,
      StoreName: true,
      CustomerName: true,
      Email: true,
      Phone: true,
      Website: true,
      Rep: true,
      Street1: true,
      Street2: true,
      City: true,
      StateProvince: true,
      ZipPostal: true,
      Country: true,
      ShippingStreet1: true,
      ShippingStreet2: true,
      ShippingCity: true,
      ShippingStateProvince: true,
      ShippingZipPostal: true,
      ShippingCountry: true,
    },
  })

  if (!customer) {
    return null
  }

  return {
    id: customer.ID,
    storeName: customer.StoreName ?? '',
    buyerName: customer.CustomerName,
    email: customer.Email,
    phone: customer.Phone,
    website: customer.Website,
    rep: customer.Rep,
    street1: customer.Street1,
    street2: customer.Street2,
    city: customer.City,
    stateProvince: customer.StateProvince,
    zipPostal: customer.ZipPostal,
    country: customer.Country,
    shippingStreet1: customer.ShippingStreet1,
    shippingStreet2: customer.ShippingStreet2,
    shippingCity: customer.ShippingCity,
    shippingStateProvince: customer.ShippingStateProvince,
    shippingZipPostal: customer.ShippingZipPostal,
    shippingCountry: customer.ShippingCountry,
  }
}

// ============================================================================
// Rep Code Resolution
// ============================================================================

/**
 * Helper to resolve rep code from repId or fallback to raw rep string.
 * If repId is provided, looks up the code from Reps table.
 * Returns code (with fallback to Name if Code is empty).
 */
async function resolveRepCode(repId: string | null | undefined, repFallback: string | null | undefined): Promise<string | null> {
  if (repId) {
    const repIdNum = parseInt(repId)
    if (!Number.isNaN(repIdNum)) {
      const rep = await prisma.reps.findUnique({
        where: { ID: repIdNum },
        select: { Code: true, Name: true },
      })
      if (rep) {
        return rep.Code?.trim() || rep.Name || ''
      }
    }
  }
  return repFallback ?? null
}

/**
 * Create a new customer.
 */
export async function createCustomer(
  data: CustomerInput
): Promise<{ success: boolean; id?: number; error?: string }> {
  try {
    if (!data.storeName?.trim()) {
      return { success: false, error: 'Store name is required' }
    }

    // Resolve rep code from repId if provided
    const repCode = await resolveRepCode(data.repId, data.rep)

    const created = await prisma.customers.create({
      data: {
        StoreName: data.storeName.trim(),
        Email: data.email ?? null,
        CustomerName: data.customerName ?? null,
        Phone: data.phone ?? null,
        Rep: repCode,
        Street1: data.street1 ?? null,
        Street2: data.street2 ?? null,
        City: data.city ?? null,
        StateProvince: data.stateProvince ?? null,
        ZipPostal: data.zipPostal ?? null,
        Country: data.country ?? null,
        ShippingStreet1: data.shippingStreet1 ?? null,
        ShippingStreet2: data.shippingStreet2 ?? null,
        ShippingCity: data.shippingCity ?? null,
        ShippingStateProvince: data.shippingStateProvince ?? null,
        ShippingZipPostal: data.shippingZipPostal ?? null,
        ShippingCountry: data.shippingCountry ?? null,
        Website: data.website ?? null,
        AdditionalInfo: data.additionalInfo ?? null,
      },
      select: { ID: true },
    })

    revalidatePath('/admin/customers')
    return { success: true, id: created.ID }
  } catch {
    return { success: false, error: 'Failed to create customer' }
  }
}

/**
 * Update an existing customer.
 */
export async function updateCustomer(
  id: string,
  data: Partial<CustomerInput>
): Promise<{ success: boolean; error?: string }> {
  try {
    const customerId = parseInt(id)
    if (Number.isNaN(customerId)) {
      return { success: false, error: 'Invalid customer id' }
    }

    // Resolve rep code if repId is provided
    let repUpdate: { Rep?: string | null } = {}
    if (data.repId !== undefined) {
      const repCode = await resolveRepCode(data.repId, data.rep)
      repUpdate = { Rep: repCode }
    } else if (data.rep !== undefined) {
      repUpdate = { Rep: data.rep ?? null }
    }

    await prisma.customers.update({
      where: { ID: customerId },
      data: {
        ...(data.storeName !== undefined ? { StoreName: data.storeName.trim() } : {}),
        ...(data.email !== undefined ? { Email: data.email ?? null } : {}),
        ...(data.customerName !== undefined ? { CustomerName: data.customerName ?? null } : {}),
        ...(data.phone !== undefined ? { Phone: data.phone ?? null } : {}),
        ...repUpdate,
        ...(data.street1 !== undefined ? { Street1: data.street1 ?? null } : {}),
        ...(data.street2 !== undefined ? { Street2: data.street2 ?? null } : {}),
        ...(data.city !== undefined ? { City: data.city ?? null } : {}),
        ...(data.stateProvince !== undefined ? { StateProvince: data.stateProvince ?? null } : {}),
        ...(data.zipPostal !== undefined ? { ZipPostal: data.zipPostal ?? null } : {}),
        ...(data.country !== undefined ? { Country: data.country ?? null } : {}),
        ...(data.shippingStreet1 !== undefined ? { ShippingStreet1: data.shippingStreet1 ?? null } : {}),
        ...(data.shippingStreet2 !== undefined ? { ShippingStreet2: data.shippingStreet2 ?? null } : {}),
        ...(data.shippingCity !== undefined ? { ShippingCity: data.shippingCity ?? null } : {}),
        ...(data.shippingStateProvince !== undefined
          ? { ShippingStateProvince: data.shippingStateProvince ?? null }
          : {}),
        ...(data.shippingZipPostal !== undefined ? { ShippingZipPostal: data.shippingZipPostal ?? null } : {}),
        ...(data.shippingCountry !== undefined ? { ShippingCountry: data.shippingCountry ?? null } : {}),
        ...(data.website !== undefined ? { Website: data.website ?? null } : {}),
        ...(data.additionalInfo !== undefined ? { AdditionalInfo: data.additionalInfo ?? null } : {}),
      },
    })

    revalidatePath('/admin/customers')
    return { success: true }
  } catch {
    return { success: false, error: 'Failed to update customer' }
  }
}

/**
 * Delete a customer.
 */
export async function deleteCustomer(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const customerId = parseInt(id)
    if (Number.isNaN(customerId)) {
      return { success: false, error: 'Invalid customer id' }
    }

    await prisma.customers.delete({
      where: { ID: customerId },
    })

    revalidatePath('/admin/customers')
    return { success: true }
  } catch {
    return { success: false, error: 'Failed to delete customer' }
  }
}
