'use client'

import { useEffect } from 'react'
import { AlertCircle, RefreshCw, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ErrorPageProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function BuyerError({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    // Log error to console in development
    console.error('Buyer page error:', error)
  }, [error])

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertCircle className="w-8 h-8 text-destructive" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">
            Something went wrong
          </h1>
          <p className="text-muted-foreground">
            We encountered an error while loading this page. This might be a temporary issue.
          </p>
        </div>

        {process.env.NODE_ENV === 'development' && error.message && (
          <div className="bg-muted/50 rounded-md p-4 text-left">
            <p className="text-xs font-mono text-muted-foreground break-all">
              {error.message}
            </p>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button onClick={reset} variant="default">
            <RefreshCw className="w-4 h-4 mr-2" />
            Try Again
          </Button>
          <Button variant="outline" asChild>
            <a href="/buyer/select-journey">
              <Home className="w-4 h-4 mr-2" />
              Back to Home
            </a>
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          If this problem persists, please contact support.
        </p>
      </div>
    </div>
  )
}
