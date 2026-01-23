'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Button, Input } from '@/components/ui'
import { updateEmailSettings, updateSmtpSettings } from '@/lib/data/actions/settings'
import type { EmailSettingsRecord } from '@/lib/types/settings'

// ============================================================================
// Types
// ============================================================================

interface EmailSettingsTabProps {
  emailSettings: EmailSettingsRecord
}

type StatusMessage = { kind: 'success' | 'error'; message: string } | null

// ============================================================================
// Component
// ============================================================================

export function EmailSettingsTab({ emailSettings }: EmailSettingsTabProps) {
  const router = useRouter()
  const [isPending, startTransition] = React.useTransition()

  // Sender identity
  const [fromEmail, setFromEmail] = React.useState(emailSettings.FromEmail ?? '')
  const [fromName, setFromName] = React.useState(emailSettings.FromName ?? '')
  const [salesTeamEmails, setSalesTeamEmails] = React.useState(emailSettings.SalesTeamEmails ?? '')
  const [ccEmails, setCcEmails] = React.useState(emailSettings.CCEmails ?? '')

  // Order toggles
  const [notifyOnNewOrder, setNotifyOnNewOrder] = React.useState(emailSettings.NotifyOnNewOrder)
  const [notifyOnOrderUpdate, setNotifyOnOrderUpdate] = React.useState(emailSettings.NotifyOnOrderUpdate)
  const [sendCustomerConfirmation, setSendCustomerConfirmation] = React.useState(emailSettings.SendCustomerConfirmation)
  const [sendRepOrderCopy, setSendRepOrderCopy] = React.useState(emailSettings.SendRepOrderCopy)

  // Shipment toggles
  const [sendShipmentConfirmation, setSendShipmentConfirmation] = React.useState(emailSettings.SendShipmentConfirmation)
  const [sendShipmentRepNotify, setSendShipmentRepNotify] = React.useState(emailSettings.SendShipmentRepNotify)
  const [sendTrackingUpdates, setSendTrackingUpdates] = React.useState(emailSettings.SendTrackingUpdates)
  const [attachInvoicePdf, setAttachInvoicePdf] = React.useState(emailSettings.AttachInvoicePdf)
  const [attachPackingSlipPdf, setAttachPackingSlipPdf] = React.useState(emailSettings.AttachPackingSlipPdf)

  // SMTP settings
  const [smtpHost, setSmtpHost] = React.useState(emailSettings.SmtpHost ?? '')
  const [smtpPort, setSmtpPort] = React.useState(emailSettings.SmtpPort?.toString() ?? '587')
  const [smtpUser, setSmtpUser] = React.useState(emailSettings.SmtpUser ?? '')
  const [smtpPassword, setSmtpPassword] = React.useState(emailSettings.SmtpPassword ?? '')
  const [smtpSecure, setSmtpSecure] = React.useState(emailSettings.SmtpSecure)

  // Test email
  const [testEmailAddress, setTestEmailAddress] = React.useState('')
  const [isTestingEmail, setIsTestingEmail] = React.useState(false)

  // Status messages
  const [emailStatus, setEmailStatus] = React.useState<StatusMessage>(null)
  const [smtpStatus, setSmtpStatus] = React.useState<StatusMessage>(null)
  const [testEmailStatus, setTestEmailStatus] = React.useState<StatusMessage>(null)

  const canSubmit = !isPending

  // Save email notification settings
  const onSaveEmailSettings = () => {
    setEmailStatus(null)
    startTransition(async () => {
      const result = await updateEmailSettings({
        FromEmail: fromEmail,
        FromName: fromName || null,
        SalesTeamEmails: salesTeamEmails || null,
        CCEmails: ccEmails || null,
        NotifyOnNewOrder: notifyOnNewOrder,
        NotifyOnOrderUpdate: notifyOnOrderUpdate,
        SendCustomerConfirmation: sendCustomerConfirmation,
        SendRepOrderCopy: sendRepOrderCopy,
        SendShipmentConfirmation: sendShipmentConfirmation,
        SendShipmentRepNotify: sendShipmentRepNotify,
        SendTrackingUpdates: sendTrackingUpdates,
        AttachInvoicePdf: attachInvoicePdf,
        AttachPackingSlipPdf: attachPackingSlipPdf,
      })

      if (result.success) {
        setEmailStatus({ kind: 'success', message: result.message || 'Email settings saved.' })
        router.refresh()
      } else {
        setEmailStatus({ kind: 'error', message: result.error })
      }
    })
  }

  // Save SMTP settings
  const onSaveSmtpSettings = () => {
    setSmtpStatus(null)
    startTransition(async () => {
      const result = await updateSmtpSettings({
        SmtpHost: smtpHost || null,
        SmtpPort: smtpPort ? parseInt(smtpPort, 10) : null,
        SmtpUser: smtpUser || null,
        SmtpPassword: smtpPassword || null,
        SmtpSecure: smtpSecure,
      })

      if (result.success) {
        setSmtpStatus({ kind: 'success', message: result.message || 'SMTP settings saved.' })
        router.refresh()
      } else {
        setSmtpStatus({ kind: 'error', message: result.error })
      }
    })
  }

  // Test email
  const onTestEmail = async () => {
    if (!testEmailAddress) return
    setTestEmailStatus(null)
    setIsTestingEmail(true)

    try {
      const response = await fetch('/api/admin/email/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testEmailAddress }),
      })

      const data = await response.json()

      if (data.success) {
        setTestEmailStatus({ kind: 'success', message: 'Test email sent successfully!' })
      } else {
        setTestEmailStatus({ kind: 'error', message: data.error || 'Failed to send test email' })
      }
    } catch {
      setTestEmailStatus({ kind: 'error', message: 'Failed to send test email' })
    } finally {
      setIsTestingEmail(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* SMTP Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>SMTP Configuration</CardTitle>
          <CardDescription>
            Configure SMTP server for sending emails.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">SMTP Host</label>
              <Input
                value={smtpHost}
                onChange={(e) => setSmtpHost(e.target.value)}
                placeholder="smtp.office365.com"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">SMTP Port</label>
              <Input
                type="number"
                inputMode="numeric"
                value={smtpPort}
                onChange={(e) => setSmtpPort(e.target.value)}
                placeholder="587"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">SMTP User</label>
              <Input
                type="email"
                value={smtpUser}
                onChange={(e) => setSmtpUser(e.target.value)}
                placeholder="orders@company.com"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">SMTP Password</label>
              <Input
                type="password"
                value={smtpPassword}
                onChange={(e) => setSmtpPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
          </div>

          <div className="space-y-3">
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={smtpSecure}
                onChange={(e) => setSmtpSecure(e.target.checked)}
              />
              Use SSL/TLS (port 465). Leave unchecked for STARTTLS (port 587).
            </label>
          </div>

          <div className="flex items-center gap-3">
            <Button type="button" onClick={onSaveSmtpSettings} disabled={!canSubmit}>
              {isPending ? 'Saving...' : 'Save SMTP Settings'}
            </Button>

            {smtpStatus && (
              <p className={smtpStatus.kind === 'success' ? 'text-sm text-green-600' : 'text-sm text-red-600'}>
                {smtpStatus.message}
              </p>
            )}
          </div>

          <div className="border-t border-border pt-4 mt-4">
            <label className="text-sm font-medium block mb-2">Send Test Email</label>
            <div className="flex gap-2">
              <Input
                type="email"
                value={testEmailAddress}
                onChange={(e) => setTestEmailAddress(e.target.value)}
                placeholder="recipient@example.com"
                className="max-w-xs"
              />
              <Button
                type="button"
                variant="outline"
                onClick={onTestEmail}
                disabled={isTestingEmail || !canSubmit || !testEmailAddress}
              >
                {isTestingEmail ? 'Sending...' : 'Send Test'}
              </Button>
            </div>
            {testEmailStatus && (
              <p className={testEmailStatus.kind === 'success' ? 'text-sm text-green-600 mt-2' : 'text-sm text-red-600 mt-2'}>
                {testEmailStatus.message}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Sender Identity & Recipients */}
      <Card>
        <CardHeader>
          <CardTitle>Sender Identity</CardTitle>
          <CardDescription>
            Configure the From address and default recipients.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">From Email *</label>
              <Input
                type="email"
                value={fromEmail}
                onChange={(e) => setFromEmail(e.target.value)}
                placeholder="orders@limeapple.com"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">From Name</label>
              <Input
                value={fromName}
                onChange={(e) => setFromName(e.target.value)}
                placeholder="Order Hub (Limeapple)"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Sales Team Emails</label>
            <Input
              value={salesTeamEmails}
              onChange={(e) => setSalesTeamEmails(e.target.value)}
              placeholder="orders@limeapple.com, sales@limeapple.com"
            />
            <p className="text-xs text-muted-foreground">
              Comma-separated list of emails to receive order/shipment notifications.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">CC Emails</label>
            <Input
              value={ccEmails}
              onChange={(e) => setCcEmails(e.target.value)}
              placeholder="accounting@limeapple.com"
            />
            <p className="text-xs text-muted-foreground">
              Comma-separated list of emails to CC on customer confirmations.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Order Email Toggles */}
      <Card>
        <CardHeader>
          <CardTitle>Order Emails</CardTitle>
          <CardDescription>
            Configure which order-related emails are sent.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={sendCustomerConfirmation}
              onChange={(e) => setSendCustomerConfirmation(e.target.checked)}
            />
            <div>
              <span className="font-medium">Send confirmation to customer</span>
              <span className="text-muted-foreground ml-2">→ Customer Email + CC Emails</span>
            </div>
          </label>

          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={notifyOnNewOrder}
              onChange={(e) => setNotifyOnNewOrder(e.target.checked)}
            />
            <div>
              <span className="font-medium">Send notification to sales team on new order</span>
              <span className="text-muted-foreground ml-2">→ Sales Team Emails</span>
            </div>
          </label>

          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={sendRepOrderCopy}
              onChange={(e) => setSendRepOrderCopy(e.target.checked)}
            />
            <div>
              <span className="font-medium">Send copy to assigned rep</span>
              <span className="text-muted-foreground ml-2">→ Rep Email (if assigned)</span>
            </div>
          </label>

          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={notifyOnOrderUpdate}
              onChange={(e) => setNotifyOnOrderUpdate(e.target.checked)}
            />
            <div>
              <span className="font-medium">Send notification on order update</span>
              <span className="text-muted-foreground ml-2">→ Same recipients as above</span>
            </div>
          </label>
        </CardContent>
      </Card>

      {/* Shipment Email Toggles */}
      <Card>
        <CardHeader>
          <CardTitle>Shipment Emails</CardTitle>
          <CardDescription>
            Configure which shipment-related emails are sent.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={sendShipmentConfirmation}
              onChange={(e) => setSendShipmentConfirmation(e.target.checked)}
            />
            <div>
              <span className="font-medium">Send shipment confirmation to customer</span>
              <span className="text-muted-foreground ml-2">→ Customer Email</span>
            </div>
          </label>

          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={sendShipmentRepNotify}
              onChange={(e) => setSendShipmentRepNotify(e.target.checked)}
            />
            <div>
              <span className="font-medium">Send shipment notification to rep</span>
              <span className="text-muted-foreground ml-2">→ Rep Email / Sales Team</span>
            </div>
          </label>

          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={sendTrackingUpdates}
              onChange={(e) => setSendTrackingUpdates(e.target.checked)}
            />
            <div>
              <span className="font-medium">Send tracking updates to customer</span>
              <span className="text-muted-foreground ml-2">→ Customer Email</span>
            </div>
          </label>

          <div className="border-t border-border pt-4 mt-4">
            <label className="text-sm font-medium block mb-3">Attachments</label>
            <div className="space-y-3">
              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={attachInvoicePdf}
                  onChange={(e) => setAttachInvoicePdf(e.target.checked)}
                />
                Attach invoice PDF to shipment emails
              </label>

              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={attachPackingSlipPdf}
                  onChange={(e) => setAttachPackingSlipPdf(e.target.checked)}
                />
                Attach packing slip PDF to shipment emails
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save All */}
      <div className="flex items-center gap-3">
        <Button type="button" onClick={onSaveEmailSettings} disabled={!canSubmit}>
          {isPending ? 'Saving...' : 'Save Email Settings'}
        </Button>

        {emailStatus && (
          <p className={emailStatus.kind === 'success' ? 'text-sm text-green-600' : 'text-sm text-red-600'}>
            {emailStatus.message}
          </p>
        )}
      </div>
    </div>
  )
}
