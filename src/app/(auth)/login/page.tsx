import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth/providers'
import { LoginForm } from '@/components/auth/login-form'
import { getValidCallbackForRole } from '@/lib/utils/auth'
import { ArrowLeft, ShoppingBag } from 'lucide-react'
import type { UserRole } from '@/lib/types/auth'

interface Props {
  searchParams: Promise<{ callbackUrl?: string }>
}

export default async function LoginPage({ searchParams }: Props) {
  const session = await auth()
  const params = await searchParams

  // Already authenticated → redirect to portal (with callback validation)
  if (session?.user) {
    const role = session.user.role as UserRole
    const safeCallback = getValidCallbackForRole(params?.callbackUrl, role)
    redirect(safeCallback)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30">
      <div className="bg-background p-8 rounded-lg shadow-lg w-full max-w-md">
        <h1 className="text-2xl font-bold mb-2 text-center">OrderHub</h1>
        <p className="text-sm text-muted-foreground mb-6 text-center">Sign in to your account</p>

        <Suspense fallback={<div className="flex justify-center py-4">Loading...</div>}>
          <LoginForm />
        </Suspense>

        {/* Wholesale Order CTA */}
        <div className="mt-8 pt-6 border-t">
          <p className="text-sm text-center text-muted-foreground mb-3">
            Looking to place a wholesale order?
          </p>
          <Link
            href="/buyer/select-journey"
            className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-md border border-primary/20 bg-primary/5 text-primary hover:bg-primary/10 transition-colors text-sm font-medium"
          >
            <ShoppingBag className="size-4" />
            Place an Order
          </Link>
        </div>

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
  title: 'Sign In | OrderHub',
  description: 'Sign in to OrderHub',
}
