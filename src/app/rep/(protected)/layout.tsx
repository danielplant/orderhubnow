import type { ReactNode } from 'react'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth/providers'
import { PortalLayout } from '@/components/portal'
import { AdminViewBanner } from '@/components/portal/admin-view-banner'
import { repNav } from '@/lib/constants/navigation'
import { getRepById } from '@/lib/data/queries/reps'
import { logAdminViewAs } from '@/lib/data/actions/audit'
import { ImageConfigProvider } from '@/lib/contexts'
import type { UserRole } from '@/lib/types/auth'

interface Props {
  children: ReactNode
}

export default async function RepLayout({ children }: Props) {
  const session = await auth()
  const role = session?.user?.role as UserRole | undefined

  // Get URL search params from headers (layouts don't receive searchParams)
  const headersList = await headers()
  const referer = headersList.get('x-url') || headersList.get('referer') || ''

  // Parse URL to get search params
  let adminViewAs: string | null = null
  let repNameParam: string | null = null

  try {
    // Try to parse the current URL from the x-url header (set by middleware)
    // or fall back to checking the referer
    const url = new URL(referer, 'http://localhost')
    adminViewAs = url.searchParams.get('adminViewAs')
    repNameParam = url.searchParams.get('repName')
  } catch {
    // URL parsing failed, continue without view-as
  }

  // Determine if this is admin view-as mode
  const isViewAsMode = role === 'admin' && !!adminViewAs

  let displayName: string = session?.user?.name || 'Sales Rep'
  let repCode: string | undefined

  if (isViewAsMode) {
    // Admin in view-as mode - validate and get rep info
    const effectiveRepId = parseInt(adminViewAs!, 10)

    if (isNaN(effectiveRepId)) {
      redirect('/admin')
    }

    const rep = await getRepById(effectiveRepId)
    if (!rep) {
      // Invalid rep ID - redirect back to admin
      redirect('/admin')
    }

    // Use rep name from URL param or fetched data
    displayName = repNameParam || rep.name
    repCode = rep.code

    // Log the view-as action
    await logAdminViewAs({
      adminId: session!.user.id,
      adminLoginId: session!.user.loginId,
      viewAsRepId: effectiveRepId,
      viewAsRepName: displayName,
      action: 'view',
      timestamp: new Date(),
    })
  }

  // Build view-as params for link building
  const viewAsParams = isViewAsMode
    ? { repId: adminViewAs!, repName: repNameParam ?? undefined }
    : null

  return (
    <ImageConfigProvider>
      {isViewAsMode && (
        <AdminViewBanner
          repName={displayName}
          repCode={repCode}
          isReadOnly
        />
      )}
      <PortalLayout
        title="Rep Portal"
        nav={repNav}
        logoutUrl="/login"
        userName={displayName}
        userRole={role}
        currentPortal="rep"
        isViewAsMode={isViewAsMode}
        viewAsParams={viewAsParams}
      >
        {children}
      </PortalLayout>
    </ImageConfigProvider>
  )
}
