import type { ReactNode } from 'react'
import AdminSidebar from '@/components/admin/admin-sidebar'

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background px-6 py-4">
        <div className="text-sm font-semibold">MyOrderHub — Admin</div>
      </header>

      <div className="flex min-h-[calc(100vh-65px)]">
        <AdminSidebar />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  )
}