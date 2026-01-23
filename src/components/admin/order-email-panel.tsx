'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, Button } from '@/components/ui'
import { Mail, Send, Check, X, RefreshCw } from 'lucide-react'
import { formatDateTime } from '@/lib/utils/format'
import type { OrderEmailLogEntry, EmailType } from '@/lib/audit/activity-logger'

interface OrderEmailPanelProps {
  orderId: string
  orderNumber: string
  customerEmail: string | null
  repEmail: string | null
  emailLogs: OrderEmailLogEntry[]
}

const EMAIL_TYPE_LABELS: Record<EmailType, string> = {
  order_confirmation: 'Customer Confirmation',
  order_update: 'Order Update',
  sales_notification: 'Sales Notification',
  shipment_confirmation: 'Shipment Confirmation',
  tracking_update: 'Tracking Update',
  rep_notification: 'Rep Notification',
  password_reset: 'Password Reset',
  test_email: 'Test Email',
}

export function OrderEmailPanel({
  orderId,
  orderNumber,
  customerEmail,
  repEmail,
  emailLogs,
}: OrderEmailPanelProps) {
  const router = useRouter()
  const [isResending, setIsResending] = React.useState<'customer' | 'sales' | null>(null)

  // Check if emails have been sent
  const customerEmailSent = emailLogs.some(
    (log) => log.emailType === 'order_confirmation' || log.emailType === 'order_update'
  )
  const salesEmailSent = emailLogs.some(
    (log) => log.emailType === 'sales_notification' || log.emailType === 'rep_notification'
  )

  const handleResend = async (type: 'customer' | 'sales') => {
    setIsResending(type)
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/resend-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      })

      const data = await response.json()

      if (data.success) {
        toast.success(`Email sent for ${orderNumber}`, {
          description: type === 'customer' ? `Sent to ${customerEmail}` : 'Sent to sales team',
        })
        router.refresh()
      } else {
        toast.error('Failed to send email', {
          description: data.error || 'An unexpected error occurred',
        })
      }
    } catch {
      toast.error('Failed to send email', {
        description: 'An unexpected error occurred',
      })
    } finally {
      setIsResending(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Email Notifications
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Email Status Summary */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-border p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {customerEmailSent ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <X className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="text-sm font-medium">Customer</span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleResend('customer')}
                disabled={!customerEmail || isResending !== null}
              >
                {isResending === 'customer' ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1 truncate">
              {customerEmail || 'No email address'}
            </p>
          </div>

          <div className="rounded-lg border border-border p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {salesEmailSent ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <X className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="text-sm font-medium">Sales Team</span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleResend('sales')}
                disabled={isResending !== null}
              >
                {isResending === 'sales' ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1 truncate">
              {repEmail || 'Sales team emails from settings'}
            </p>
          </div>
        </div>

        {/* Email History */}
        {emailLogs.length > 0 ? (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">Email History</h4>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {emailLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between text-sm py-1 border-b border-border last:border-b-0"
                >
                  <div className="flex items-center gap-2">
                    <Mail className="h-3 w-3 text-muted-foreground" />
                    <span>{EMAIL_TYPE_LABELS[log.emailType] || log.emailType}</span>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <div className="truncate max-w-[150px]">{log.recipient}</div>
                    <div>{formatDateTime(log.timestamp)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No email history recorded for this order.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
