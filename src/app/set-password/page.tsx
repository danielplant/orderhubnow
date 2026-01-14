'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

type PageState = 'loading' | 'valid' | 'invalid' | 'success' | 'error'

function SetPasswordForm() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get('token')

  const [pageState, setPageState] = useState<PageState>('loading')
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Validate token on mount
  useEffect(() => {
    async function validateToken() {
      if (!token) {
        setPageState('invalid')
        setErrorMessage('No token provided')
        return
      }

      try {
        const res = await fetch('/api/auth/validate-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })

        const data = await res.json()

        if (data.valid) {
          setPageState('valid')
        } else {
          setPageState('invalid')
          setErrorMessage(data.error || 'Invalid or expired link')
        }
      } catch {
        setPageState('invalid')
        setErrorMessage('Unable to validate link')
      }
    }

    validateToken()
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    // Validation
    if (password.length < 8) {
      setFormError('Password must be at least 8 characters')
      return
    }

    if (password !== confirmPassword) {
      setFormError('Passwords do not match')
      return
    }

    setIsSubmitting(true)

    try {
      const res = await fetch('/api/auth/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })

      const data = await res.json()

      if (data.success) {
        setPageState('success')
      } else {
        setFormError(data.error || 'Failed to set password')
      }
    } catch {
      setFormError('Something went wrong. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Loading state
  if (pageState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="bg-background p-8 rounded-lg shadow-lg text-center">
          <p className="text-muted-foreground">Validating link...</p>
        </div>
      </div>
    )
  }

  // Invalid token
  if (pageState === 'invalid') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="bg-background p-8 rounded-lg shadow-lg max-w-md text-center">
          <h1 className="text-2xl font-bold mb-4">Link Not Valid</h1>
          <p className="text-muted-foreground mb-6">{errorMessage}</p>
          <p className="text-sm text-muted-foreground mb-4">
            If you need a new link, please contact your administrator or request a password reset.
          </p>
          <Button onClick={() => router.push('/rep/login')}>Go to Login</Button>
        </div>
      </div>
    )
  }

  // Success state
  if (pageState === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="bg-background p-8 rounded-lg shadow-lg max-w-md text-center">
          <h1 className="text-2xl font-bold mb-4 text-green-600">Password Set Successfully</h1>
          <p className="text-muted-foreground mb-6">
            Your password has been set. You can now log in to your account.
          </p>
          <Button onClick={() => router.push('/rep/login')}>Go to Login</Button>
        </div>
      </div>
    )
  }

  // Form state
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30">
      <div className="bg-background p-8 rounded-lg shadow-lg w-full max-w-md">
        <h1 className="text-2xl font-bold mb-2 text-center">Set Your Password</h1>
        <p className="text-sm text-muted-foreground mb-6 text-center">
          Choose a password for your OrderHub account.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-1">
              New Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full px-3 py-2 border rounded-md"
              autoComplete="new-password"
            />
            <p className="text-xs text-muted-foreground mt-1">
              At least 8 characters
            </p>
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium mb-1">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="w-full px-3 py-2 border rounded-md"
              autoComplete="new-password"
            />
          </div>

          {formError && <p className="text-red-500 text-sm">{formError}</p>}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Setting Password...' : 'Set Password'}
          </Button>
        </form>
      </div>
    </div>
  )
}

export default function SetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="bg-background p-8 rounded-lg shadow-lg text-center">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    }>
      <SetPasswordForm />
    </Suspense>
  )
}
