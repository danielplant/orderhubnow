'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import {
  sendRepInviteEmail,
  sendPasswordResetEmail,
  generateInviteLink as generateLink,
} from '@/lib/email/send-auth-emails'

/**
 * Create a new rep with invite flow.
 * Creates Reps row + Users row, sends invite email.
 * Returns invite URL for copy-link fallback.
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
}): Promise<{ success: boolean; id?: number; inviteUrl?: string; error?: string }> {
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

    const email = input.email1.trim()

    // Validate email format
    if (!email.includes('@')) {
      return { success: false, error: 'Invalid email format' }
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
        Email1: email,
        Email2: input.email2 ?? '',
        Email3: input.email3 ?? '',
        Country: input.country.trim(),
      },
      select: { ID: true, Name: true },
    })

    // Create user login with invited status
    const user = await prisma.users.create({
      data: {
        LoginID: email,
        Email: email,
        Password: null,
        PasswordHash: null,
        UserType: 'rep',
        RepId: created.ID,
        Status: 'invited',
        MustResetPassword: true,
      },
      select: { ID: true },
    })

    // Send invite email
    const emailResult = await sendRepInviteEmail(user.ID, created.Name, email)

    revalidatePath('/admin/reps')

    return {
      success: true,
      id: created.ID,
      inviteUrl: emailResult.inviteUrl,
    }
  } catch (error) {
    console.error('Create rep error:', error)
    return { success: false, error: 'Failed to create rep' }
  }
}

/**
 * Update rep details (not password or status).
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

    // If email1 changed, update Users.Email too
    if (data.email1 !== undefined) {
      await prisma.users.updateMany({
        where: { RepId: repId },
        data: { Email: data.email1.trim() },
      })
    }

    revalidatePath('/admin/reps')
    return { success: true }
  } catch {
    return { success: false, error: 'Failed to update rep' }
  }
}

/**
 * Resend invite email to a rep who hasn't set their password yet.
 * Returns invite URL for copy-link fallback.
 */
export async function resendInvite(
  userId: number
): Promise<{ success: boolean; inviteUrl?: string; error?: string }> {
  try {
    const user = await prisma.users.findUnique({
      where: { ID: userId },
      include: { Reps: true },
    })

    if (!user) {
      return { success: false, error: 'User not found' }
    }

    const email = user.Email || user.LoginID
    if (!email || !email.includes('@')) {
      return { success: false, error: 'No valid email address on file' }
    }

    const repName = user.Reps?.Name || 'Rep'

    const result = await sendRepInviteEmail(user.ID, repName, email)

    revalidatePath('/admin/reps')

    if (!result.success) {
      return { success: false, error: result.error }
    }

    return { success: true, inviteUrl: result.inviteUrl }
  } catch {
    return { success: false, error: 'Failed to send invite' }
  }
}

/**
 * Force password reset for an active user.
 * Sets MustResetPassword flag and sends reset email.
 * Returns reset URL for copy-link fallback.
 */
export async function forcePasswordReset(
  userId: number
): Promise<{ success: boolean; resetUrl?: string; error?: string }> {
  try {
    const user = await prisma.users.findUnique({
      where: { ID: userId },
    })

    if (!user) {
      return { success: false, error: 'User not found' }
    }

    const email = user.Email || user.LoginID
    if (!email || !email.includes('@')) {
      return { success: false, error: 'No valid email address on file' }
    }

    // Set must reset flag
    await prisma.users.update({
      where: { ID: userId },
      data: { MustResetPassword: true },
    })

    // Send reset email
    const result = await sendPasswordResetEmail(user.ID, email)

    revalidatePath('/admin/reps')

    if (!result.success) {
      return { success: false, error: result.error }
    }

    return { success: true, resetUrl: result.inviteUrl }
  } catch {
    return { success: false, error: 'Failed to send reset email' }
  }
}

/**
 * Disable a rep's login.
 */
export async function disableRep(
  userId: number
): Promise<{ success: boolean; error?: string }> {
  try {
    await prisma.users.update({
      where: { ID: userId },
      data: { Status: 'disabled' },
    })

    revalidatePath('/admin/reps')
    return { success: true }
  } catch {
    return { success: false, error: 'Failed to disable rep' }
  }
}

/**
 * Re-enable a disabled rep by sending them a new invite.
 * Returns invite URL for copy-link fallback.
 */
export async function enableRep(
  userId: number
): Promise<{ success: boolean; inviteUrl?: string; error?: string }> {
  try {
    const user = await prisma.users.findUnique({
      where: { ID: userId },
      include: { Reps: true },
    })

    if (!user) {
      return { success: false, error: 'User not found' }
    }

    const email = user.Email || user.LoginID
    if (!email || !email.includes('@')) {
      return { success: false, error: 'No valid email address on file' }
    }

    // Reset to invited status
    await prisma.users.update({
      where: { ID: userId },
      data: {
        Status: 'invited',
        PasswordHash: null,
        MustResetPassword: true,
      },
    })

    const repName = user.Reps?.Name || 'Rep'

    // Send new invite
    const result = await sendRepInviteEmail(user.ID, repName, email)

    revalidatePath('/admin/reps')

    if (!result.success) {
      return { success: false, error: result.error }
    }

    return { success: true, inviteUrl: result.inviteUrl }
  } catch {
    return { success: false, error: 'Failed to enable rep' }
  }
}

/**
 * Generate invite/reset link without sending email (copy-link fallback).
 */
export async function getInviteLink(
  userId: number
): Promise<{ success: boolean; inviteUrl?: string; error?: string }> {
  try {
    const result = await generateLink(userId)
    return result
  } catch {
    return { success: false, error: 'Failed to generate link' }
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
