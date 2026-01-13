import { prisma } from '@/lib/prisma'
import type { Rep, RepWithLogin, RepsListResult, UserStatus } from '@/lib/types/rep'

/**
 * Get all reps with their login status from Users table.
 * Note: Password is never exposed - only status.
 */
export async function getReps(): Promise<RepsListResult> {
  // Fetch reps and order counts in parallel
  const [rows, orderCounts] = await Promise.all([
    prisma.reps.findMany({
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
    }),
    // Count orders per rep
    prisma.customerOrders.groupBy({
      by: ['RepID'],
      where: { RepID: { not: null } },
      _count: { _all: true },
    }),
  ])

  // Build map of RepID -> order count
  const countMap = new Map<number, number>()
  for (const g of orderCounts) {
    if (g.RepID !== null) {
      countMap.set(g.RepID, g._count._all)
    }
  }

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
      orderCount: countMap.get(r.ID) ?? 0,
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
