'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import type { CustomerInput } from '@/lib/types/customer'

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

    const created = await prisma.customers.create({
      data: {
        StoreName: data.storeName.trim(),
        Email: data.email ?? null,
        CustomerName: data.customerName ?? null,
        Phone: data.phone ?? null,
        Rep: data.rep ?? null,
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

    await prisma.customers.update({
      where: { ID: customerId },
      data: {
        ...(data.storeName !== undefined ? { StoreName: data.storeName.trim() } : {}),
        ...(data.email !== undefined ? { Email: data.email ?? null } : {}),
        ...(data.customerName !== undefined ? { CustomerName: data.customerName ?? null } : {}),
        ...(data.phone !== undefined ? { Phone: data.phone ?? null } : {}),
        ...(data.rep !== undefined ? { Rep: data.rep ?? null } : {}),
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
