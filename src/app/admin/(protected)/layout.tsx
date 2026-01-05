import type { ReactNode } from 'react'
import { auth } from '@/lib/auth/providers'
import AdminSidebar from '@/components/admin/admin-sidebar'
import { LogoutButton } from '@/components/auth/logout-button'

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await auth()
  const userName = session?.user?.name || 'Admin'

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">MyOrderHub — Admin</div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              Logged in as <span className="font-medium text-foreground">{userName}</span>
            </span>
            <LogoutButton callbackUrl="/admin/login" />
          </div>
        </div>
      </header>

      <div className="flex min-h-[calc(100vh-65px)]">
        <AdminSidebar />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  )
}