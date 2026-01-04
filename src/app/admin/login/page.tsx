import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth/providers'
import { LoginForm } from '@/components/auth/login-form'

export default async function AdminLoginPage() {
  const session = await auth()

  // Already authenticated - redirect to appropriate dashboard
  if (session?.user) {
    if (session.user.role === 'admin') {
      redirect('/admin')
    } else {
      // Rep on admin login page - send to rep dashboard
      redirect('/rep')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30">
      <div className="bg-background p-8 rounded-lg shadow-lg">
        <h1 className="text-2xl font-bold mb-2 text-center">MyOrderHub</h1>
        <p className="text-sm text-muted-foreground mb-6 text-center">Admin Portal</p>
        <Suspense fallback={<div>Loading...</div>}>
          <LoginForm requiredRole="admin" defaultRedirect="/admin" />
        </Suspense>
      </div>
    </div>
  )
}

export const metadata = {
  title: 'Admin Login | MyOrderHub',
  description: 'Sign in to the admin portal',
}
