import { redirect } from 'next/navigation'
import { buildRepHref } from '@/lib/utils/auth'

interface Props {
  searchParams: Promise<{ adminViewAs?: string; repName?: string }>
}

/**
 * Rep dashboard - redirects to orders list.
 * Preserves view-as params for admin view-as mode.
 */
export default async function RepPage({ searchParams }: Props) {
  const params = await searchParams

  const viewAsParams = params.adminViewAs
    ? { repId: params.adminViewAs, repName: params.repName }
    : null

  redirect(buildRepHref('/rep/orders', viewAsParams))
}
