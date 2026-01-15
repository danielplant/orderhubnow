import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth/providers'
import { LoginForm } from '@/components/auth/login-form'
import { LogoutButton } from '@/components/auth/logout-button'
import { ArrowLeft, ArrowRight, UserCircle } from 'lucide-react'

export default async function AdminLoginPage() {
  const session = await auth()

  // Already authenticated as admin - redirect to dashboard
  if (session?.user?.role === 'admin') {
    redirect('/admin')
  }

  // Logged in as different role (rep) - show switch account UI
  const isWrongRole = !!session?.user

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30">
      <div className="bg-background p-8 rounded-lg shadow-lg w-full max-w-md">
        <h1 className="text-2xl font-bold mb-2 text-center">OrderHub</h1>
        <p className="text-sm text-muted-foreground mb-6 text-center">Admin Portal</p>
        
        {isWrongRole ? (
          <div className="space-y-6">
            <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
              <UserCircle className="size-10 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Currently signed in as</p>
                <p className="font-medium">{session.user.name || session.user.email}</p>
                <p className="text-xs text-muted-foreground capitalize">({session.user.role})</p>
              </div>
            </div>
            
            <p className="text-sm text-center text-muted-foreground">
              To access the Admin Portal, please sign out first.
            </p>
            
            <div className="flex justify-center">
              <LogoutButton callbackUrl="/admin/login" />
            </div>
            
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">or</span>
              </div>
            </div>
            
            <Link 
              href="/rep"
              className="flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Return to Rep Dashboard
              <ArrowRight className="size-4" />
            </Link>
          </div>
        ) : (
          <Suspense fallback={<div>Loading...</div>}>
            <LoginForm requiredRole="admin" defaultRedirect="/admin" />
          </Suspense>
        )}
        
        <div className="mt-6 text-center">
          <Link 
            href="/" 
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-4 mr-1" />
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  )
}

export const metadata = {
  title: 'Admin Login | OrderHub',
  description: 'Sign in to the admin portal',
}
