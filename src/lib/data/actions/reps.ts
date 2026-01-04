'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'

/**
 * Create a new rep with login credentials.
 * Creates both Reps row and Users row for authentication.
 */
export async function createRep(input: {
  name: string
  code: string
  address?: string
  phone?: string
  fax?: string
  cell?: string
  email1: string
  email2?: string
  email3?: string
  country: string
  password: string
}): Promise<{ success: boolean; id?: number; error?: string }> {
  try {
    if (!input.name.trim()) {
      return { success: false, error: 'Name is required' }
    }
    if (!input.code.trim()) {
      return { success: false, error: 'Code is required' }
    }
    if (!input.email1.trim()) {
      return { success: false, error: 'Email is required' }
    }
    if (!input.password.trim()) {
      return { success: false, error: 'Password is required' }
    }

    // Check if rep code already exists
    const existing = await prisma.reps.findFirst({
      where: { Code: input.code.trim() },
    })
    if (existing) {
      return { success: false, error: 'Rep code already exists' }
    }

    // Create rep
    const created = await prisma.reps.create({
      data: {
        Name: input.name.trim(),
        Code: input.code.trim(),
        Address: input.address ?? '',
        Phone: input.phone ?? '',
        Fax: input.fax ?? '',
        Cell: input.cell ?? '',
        Email1: input.email1.trim(),
        Email2: input.email2 ?? '',
        Email3: input.email3 ?? '',
        Country: input.country.trim(),
      },
      select: { ID: true },
    })

    // Create user login (Email1 as LoginID, legacy plaintext password)
    await prisma.users.create({
      data: {
        LoginID: input.email1.trim(),
        Password: input.password.trim(),
        UserType: 'rep',
        RepId: created.ID,
      },
    })

    revalidatePath('/admin/reps')
    return { success: true, id: created.ID }
  } catch {
    return { success: false, error: 'Failed to create rep' }
  }
}

/**
 * Update rep details (not password).
 */
export async function updateRep(
  id: string,
  data: Partial<{
    name: string
    code: string
    address: string
    phone: string
    fax: string
    cell: string
    email1: string
    email2: string
    email3: string
    country: string
  }>
): Promise<{ success: boolean; error?: string }> {
  try {
    const repId = parseInt(id)
    if (Number.isNaN(repId)) {
      return { success: false, error: 'Invalid rep id' }
    }

    // If code is changing, check for duplicates
    if (data.code !== undefined) {
      const existing = await prisma.reps.findFirst({
        where: {
          Code: data.code.trim(),
          NOT: { ID: repId },
        },
      })
      if (existing) {
        return { success: false, error: 'Rep code already exists' }
      }
    }

    await prisma.reps.update({
      where: { ID: repId },
      data: {
        ...(data.name !== undefined ? { Name: data.name.trim() } : {}),
        ...(data.code !== undefined ? { Code: data.code.trim() } : {}),
        ...(data.address !== undefined ? { Address: data.address } : {}),
        ...(data.phone !== undefined ? { Phone: data.phone } : {}),
        ...(data.fax !== undefined ? { Fax: data.fax } : {}),
        ...(data.cell !== undefined ? { Cell: data.cell } : {}),
        ...(data.email1 !== undefined ? { Email1: data.email1.trim() } : {}),
        ...(data.email2 !== undefined ? { Email2: data.email2.trim() } : {}),
        ...(data.email3 !== undefined ? { Email3: data.email3.trim() } : {}),
        ...(data.country !== undefined ? { Country: data.country.trim() } : {}),
      },
    })

    revalidatePath('/admin/reps')
    return { success: true }
  } catch {
    return { success: false, error: 'Failed to update rep' }
  }
}

/**
 * Update rep password in Users table.
 */
export async function updateRepPassword(input: {
  repId: string
  newPassword: string
}): Promise<{ success: boolean; error?: string }> {
  try {
    const repId = parseInt(input.repId)
    if (Number.isNaN(repId)) {
      return { success: false, error: 'Invalid rep id' }
    }

    if (!input.newPassword.trim()) {
      return { success: false, error: 'Password cannot be empty' }
    }

    // Update all user records for this rep
    const result = await prisma.users.updateMany({
      where: { RepId: repId },
      data: { Password: input.newPassword.trim() },
    })

    if (result.count === 0) {
      return { success: false, error: 'No login found for this rep' }
    }

    revalidatePath('/admin/reps')
    return { success: true }
  } catch {
    return { success: false, error: 'Failed to update password' }
  }
}

/**
 * Delete a rep and associated user login.
 */
export async function deleteRep(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const repId = parseInt(id)
    if (Number.isNaN(repId)) {
      return { success: false, error: 'Invalid rep id' }
    }

    // Delete in transaction: Users first (FK), then Reps
    await prisma.$transaction([
      prisma.users.deleteMany({ where: { RepId: repId } }),
      prisma.reps.delete({ where: { ID: repId } }),
    ])

    revalidatePath('/admin/reps')
    return { success: true }
  } catch {
    return { success: false, error: 'Failed to delete rep' }
  }
}
