import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'

interface DraftPageProps {
  params: Promise<{ id: string }>
}

/**
 * /draft/[id] - Shareable draft link redirect
 *
 * Redirects to /buyer/my-order?draft=[id] which loads the draft
 * into the order form context.
 *
 * If the draft has a RepID, includes it in the redirect URL to preserve
 * rep context (locks the rep dropdown for the user).
 */
export default async function DraftPage({ params }: DraftPageProps) {
  const { id } = await params

  // Look up draft to get RepID for preserving rep context
  const draft = await prisma.customerOrders.findFirst({
    where: {
      OrderNumber: id,
      OrderStatus: 'Draft',
    },
    select: { RepID: true },
  })

  // Build redirect URL with repId if draft has rep attribution
  const baseUrl = `/buyer/my-order?draft=${encodeURIComponent(id)}`
  const redirectUrl = draft?.RepID
    ? `${baseUrl}&repId=${draft.RepID}`
    : baseUrl

  redirect(redirectUrl)
}
