import { auth } from '@/lib/auth/providers'
import { prisma } from '@/lib/prisma'

async function requireAdmin() {
  const session = await auth()
  if (!session?.user || session.user.role !== 'admin') {
    throw new Error('Unauthorized')
  }
  return session
}
import { getAffectedOrdersByWindowChange } from '@/lib/data/queries/collections'
import { AffectedOrdersClient } from './client'
import { notFound, redirect } from 'next/navigation'

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ windowStart?: string; windowEnd?: string }>
}

export default async function AffectedOrdersPage({
  params,
  searchParams,
}: PageProps) {
  await requireAdmin()

  const { id } = await params
  const { windowStart, windowEnd } = await searchParams

  if (!windowStart || !windowEnd) {
    redirect('/admin/collections')
  }

  const collectionId = parseInt(id, 10)
  if (isNaN(collectionId)) {
    notFound()
  }

  const collection = await prisma.collection.findUnique({
    where: { id: collectionId },
    select: {
      id: true,
      name: true,
      shipWindowStart: true,
      shipWindowEnd: true,
    },
  })

  if (!collection) {
    notFound()
  }

  const result = await getAffectedOrdersByWindowChange(
    collection.id,
    windowStart,
    windowEnd
  )

  return (
    <AffectedOrdersClient
      collection={{
        id: collection.id,
        name: collection.name,
        oldStart: collection.shipWindowStart?.toISOString().split('T')[0] ?? null,
        oldEnd: collection.shipWindowEnd?.toISOString().split('T')[0] ?? null,
      }}
      newWindowStart={windowStart}
      newWindowEnd={windowEnd}
      affected={result.affected}
      totalOrders={result.totalOrders}
      totalShipments={result.totalShipments}
      invalidCount={result.invalidCount}
      shopifyExcludedCount={result.shopifyExcludedCount}
    />
  )
}
