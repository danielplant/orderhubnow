import { prisma } from '@/lib/prisma'
import type { Rep, RepWithLogin, RepsListResult, UserStatus } from '@/lib/types/rep'

/**
 * Get all reps with their login status from Users table.
 * Note: Password is never exposed - only status.
 */
export async function getReps(): Promise<RepsListResult> {
  const rows = await prisma.reps.findMany({
    orderBy: { Name: 'asc' },
    include: {
      Users: {
        select: {
          ID: true,
          Email: true,
          LoginID: true,
          Status: true,
        },
      },
    },
  })

  const items: RepWithLogin[] = rows.map((r) => {
    // A rep may have multiple users, but typically just one
    const user = r.Users[0] ?? null

    return {
      id: r.ID,
      name: r.Name,
      code: r.Code,
      address: r.Address,
      phone: r.Phone,
      fax: r.Fax,
      cell: r.Cell,
      email1: r.Email1,
      email2: r.Email2,
      email3: r.Email3,
      country: r.Country,
      userId: user?.ID ?? null,
      loginEmail: user?.Email || user?.LoginID || null,
      status: (user?.Status as UserStatus) ?? 'invited',
    }
  })

  return {
    items,
    total: items.length,
  }
}

/**
 * Get a single rep by ID.
 */
export async function getRepById(id: number): Promise<Rep | null> {
  const row = await prisma.reps.findUnique({
    where: { ID: id },
  })

  if (!row) return null

  return {
    id: row.ID,
    name: row.Name,
    code: row.Code,
    address: row.Address,
    phone: row.Phone,
    fax: row.Fax,
    cell: row.Cell,
    email1: row.Email1,
    email2: row.Email2,
    email3: row.Email3,
    country: row.Country,
  }
}
