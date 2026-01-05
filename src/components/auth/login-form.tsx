'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import type { UserRole } from '@/lib/types/auth'
import { AUTH_ERROR_CODES } from '@/lib/auth/config'

interface LoginFormProps {
  /** If provided, only users with this role can log in */
  requiredRole?: UserRole
  /** Default redirect if no callbackUrl is present */
  defaultRedirect?: string
}

/**
 * Map auth error codes to user-friendly messages.
 */
function getErrorMessage(errorCode: string): {
  message: string
  showResetLink: boolean
} {
  switch (errorCode) {
    case AUTH_ERROR_CODES.INVITED:
      return {
        message: 'Please check your email for an invite link to set up your password.',
        showResetLink: false,
      }
    case AUTH_ERROR_CODES.DISABLED:
      return {
        message: 'This account has been disabled. Please contact your administrator.',
        showResetLink: false,
      }
    case AUTH_ERROR_CODES.RESET_REQUIRED:
      return {
        message: 'A password reset is required. Please check your email or request a new reset link.',
        showResetLink: true,
      }
    default:
      return {
        message: 'Invalid email or password',
        showResetLink: false,
      }
  }
}

export function LoginForm({ requiredRole, defaultRedirect }: LoginFormProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [error, setError] = useState<{ message: string; showResetLink: boolean } | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const loginId = formData.get('loginId') as string
    const password = formData.get('password') as string

    try {
      const result = await signIn('credentials', {
        loginId,
        password,
        requiredRole,
        redirect: false,
      })

      setLoading(false)

      if (result?.error) {
        // Check for specific error codes
        const errorInfo = getErrorMessage(result.error)
        setError(errorInfo)
        return
      }

      // Get callback URL or use default redirect
      const callbackUrl = searchParams.get('callbackUrl')
      if (callbackUrl) {
        router.push(callbackUrl)
      } else if (defaultRedirect) {
        router.push(defaultRedirect)
      } else {
        // Fallback: fetch session to determine role
        const res = await fetch('/api/auth/session')
        const session = await res.json()
        const role = session?.user?.role

        if (role === 'admin') {
          router.push('/admin')
        } else if (role === 'rep') {
          router.push('/rep')
        } else {
          router.push('/')
        }
      }

      router.refresh()
    } catch {
      setLoading(false)
      setError({ message: 'Something went wrong. Please try again.', showResetLink: false })
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 w-full max-w-sm">
      <div>
        <label htmlFor="loginId" className="block text-sm font-medium mb-1">
          Email
        </label>
        <input
          id="loginId"
          name="loginId"
          type="text"
          required
          className="w-full px-3 py-2 border rounded-md"
          autoComplete="username"
          placeholder="you@example.com"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium mb-1">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          className="w-full px-3 py-2 border rounded-md"
          autoComplete="current-password"
        />
      </div>

      {error && (
        <div className="space-y-2">
          <p className="text-red-500 text-sm">{error.message}</p>
          {error.showResetLink && (
            <Link
              href="/reset-password"
              className="text-sm text-primary hover:underline block"
            >
              Request a new reset link
            </Link>
          )}
        </div>
      )}

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? 'Signing in...' : 'Sign In'}
      </Button>

      <div className="text-center">
        <Link
          href="/reset-password"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Forgot password?
        </Link>
      </div>
    </form>
  )
}
