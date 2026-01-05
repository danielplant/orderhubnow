'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      const res = await fetch('/api/auth/request-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      const data = await res.json()

      if (!res.ok && data.error) {
        setError(data.error)
      } else {
        setSubmitted(true)
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Success state
  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="bg-background p-8 rounded-lg shadow-lg max-w-md text-center">
          <h1 className="text-2xl font-bold mb-4">Check Your Email</h1>
          <p className="text-muted-foreground mb-6">
            If an account exists with that email address, you will receive a password reset link shortly.
          </p>
          <p className="text-sm text-muted-foreground mb-6">
            The link will expire in 24 hours.
          </p>
          <Button onClick={() => router.push('/rep/login')}>Back to Login</Button>
        </div>
      </div>
    )
  }

  // Form state
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30">
      <div className="bg-background p-8 rounded-lg shadow-lg w-full max-w-md">
        <h1 className="text-2xl font-bold mb-2 text-center">Reset Password</h1>
        <p className="text-sm text-muted-foreground mb-6 text-center">
          Enter your email address and we&apos;ll send you a link to reset your password.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-1">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 border rounded-md"
              autoComplete="email"
              placeholder="you@example.com"
            />
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Sending...' : 'Send Reset Link'}
          </Button>

          <div className="text-center">
            <button
              type="button"
              onClick={() => router.push('/rep/login')}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Back to Login
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
