import { redirect } from 'next/navigation'

interface Props {
  searchParams: Promise<{ callbackUrl?: string }>
}

/**
 * Rep login redirect.
 * Redirects to unified /login with callback preserved.
 */
export default async function RepLoginPage({ searchParams }: Props) {
  const params = await searchParams
  const callbackUrl = params?.callbackUrl || '/rep'
  redirect(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`)
}

export const metadata = {
  title: 'Rep Login | OrderHub',
  description: 'Redirecting to login...',
}
