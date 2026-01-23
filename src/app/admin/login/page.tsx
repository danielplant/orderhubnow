import { redirect } from 'next/navigation'

interface Props {
  searchParams: Promise<{ callbackUrl?: string }>
}

/**
 * Admin login redirect.
 * Redirects to unified /login with callback preserved.
 */
export default async function AdminLoginPage({ searchParams }: Props) {
  const params = await searchParams
  const callbackUrl = params?.callbackUrl || '/admin'
  redirect(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`)
}

export const metadata = {
  title: 'Admin Login | OrderHub',
  description: 'Redirecting to login...',
}
