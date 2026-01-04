'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import type { UserRole } from '@/lib/types/auth'

interface LoginFormProps {
  /** If provided, only users with this role can log in */
  requiredRole?: UserRole
  /** Default redirect if no callbackUrl is present */
  defaultRedirect?: string
}

export function LoginForm({ requiredRole, defaultRedirect }: LoginFormProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const loginId = formData.get('loginId') as string
    const password = formData.get('password') as string

    const result = await signIn('credentials', {
      loginId,
      password,
      requiredRole, // Pass to authorize() for server-side role enforcement
      redirect: false,
    })

    setLoading(false)

    if (result?.error) {
      setError('Invalid login ID or password')
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
        router.push('/') // Fallback
      }
    }
    
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 w-full max-w-sm">
      <div>
        <label htmlFor="loginId" className="block text-sm font-medium mb-1">
          Login ID
        </label>
        <input
          id="loginId"
          name="loginId"
          type="text"
          required
          className="w-full px-3 py-2 border rounded-md"
          autoComplete="username"
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

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? 'Signing in...' : 'Sign In'}
      </Button>
    </form>
  )
}
