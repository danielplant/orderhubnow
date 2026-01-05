import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth/providers'

export default async function NewOrderPage() {
  const session = await auth()

  if (!session?.user?.repId) {
    // Rep ID not configured for this user - redirect with error
    redirect('/rep/orders?error=rep_not_configured')
  }

  const repId = session.user.repId
  redirect(`/buyer/select-journey?repId=${repId}&returnTo=/rep/orders`)
}
