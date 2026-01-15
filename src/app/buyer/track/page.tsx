'use client'

/**
 * Order Tracking Lookup Page
 * 
 * Allows customers to enter their order number and email to receive a tracking link.
 */

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button, Input, Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { APP_NAME } from '@/lib/constants/brand'
import { Loader2, Package, Mail, Hash } from 'lucide-react'

export default function TrackOrderPage() {
  const router = useRouter()
  const [orderNumber, setOrderNumber] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [isLoading, setIsLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      const response = await fetch('/api/buyer/track/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderNumber: orderNumber.trim(), email: email.trim() }),
      })

      const data = await response.json()

      if (data.success && data.trackingUrl) {
        // Redirect to tracking page
        router.push(data.trackingUrl)
      } else {
        setError(data.error || 'Order not found. Please check your order number and email.')
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
            <Package className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{APP_NAME}</h1>
          <p className="text-gray-600 mt-1">Order Tracking</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-center">Track Your Order</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="orderNumber" className="block text-sm font-medium text-gray-700 mb-1">
                  Order Number
                </label>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="orderNumber"
                    type="text"
                    value={orderNumber}
                    onChange={(e) => setOrderNumber(e.target.value)}
                    placeholder="e.g., A10001"
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              {error && (
                <div className="p-3 rounded-md bg-red-50 border border-red-200">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Looking up order...
                  </>
                ) : (
                  'Track Order'
                )}
              </Button>
            </form>

            <p className="text-center text-xs text-gray-500 mt-4">
              Enter your order number and the email address used when placing the order.
            </p>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-gray-500 mt-6">
          Questions? Contact us at{' '}
          <a href="mailto:orders@limeapple.com" className="text-primary hover:underline">
            orders@limeapple.com
          </a>
        </p>
      </div>
    </div>
  )
}
