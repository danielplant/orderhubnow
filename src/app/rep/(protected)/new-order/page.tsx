import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth/providers'
import { getEffectiveRepId, isViewAsMode, buildRepHref } from '@/lib/utils/auth'

interface Props {
  searchParams: Promise<{ adminViewAs?: string; repName?: string }>
}

export default async function NewOrderPage({ searchParams }: Props) {
  const session = await auth()
  const params = await searchParams

  const searchParamsMap = {
    get: (key: string) => params[key as keyof typeof params] ?? null,
  }

  const effectiveRepId = getEffectiveRepId(session, searchParamsMap)
  const viewAsMode = isViewAsMode(session, searchParamsMap)

  // View-as mode is read-only - redirect back to orders
  if (viewAsMode) {
    const viewAsParams = params.adminViewAs
      ? { repId: params.adminViewAs, repName: params.repName }
      : null
    redirect(buildRepHref('/rep/orders', viewAsParams))
  }

  if (!effectiveRepId) {
    redirect('/rep')
  }

  const repId = String(effectiveRepId)
  const repName = session?.user?.name || null
  const newParams = new URLSearchParams({ repId, returnTo: '/rep/orders' })
  if (repName) newParams.set('repName', repName)
  redirect(`/buyer/select-journey?${newParams.toString()}`)
}
