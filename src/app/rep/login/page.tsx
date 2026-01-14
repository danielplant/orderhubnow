import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth/providers'
import { LoginForm } from '@/components/auth/login-form'

export default async function RepLoginPage() {
  const session = await auth()

  // Already authenticated - redirect to appropriate dashboard
  if (session?.user) {
    if (session.user.role === 'rep') {
      redirect('/rep')
    } else {
      // Admin on rep login page - send to admin dashboard
      redirect('/admin')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30">
      <div className="bg-background p-8 rounded-lg shadow-lg">
        <h1 className="text-2xl font-bold mb-2 text-center">OrderHub</h1>
        <p className="text-sm text-muted-foreground mb-6 text-center">Sales Rep Portal</p>
        <Suspense fallback={<div>Loading...</div>}>
          <LoginForm requiredRole="rep" defaultRedirect="/rep" />
        </Suspense>
      </div>
    </div>
  )
}

export const metadata = {
  title: 'Rep Login | OrderHub',
  description: 'Sign in to the sales rep portal',
}
