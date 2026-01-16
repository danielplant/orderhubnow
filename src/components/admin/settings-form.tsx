'use client'

import { useMemo, useState, useTransition, useRef } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import type { InventorySettingsRecord, CompanySettingsRecord, EmailSettingsRecord } from '@/lib/types/settings'
import {
  minimizeBigImages,
  resizeSkuImages300x450,
  updateInventorySettings,
  updateCompanySettings,
  updateEmailSettings,
  updateSmtpSettings,
} from '@/lib/data/actions/settings'

interface SettingsFormProps {
  initial: InventorySettingsRecord
  companySettings: CompanySettingsRecord
  emailSettings: EmailSettingsRecord
}

export function SettingsForm({ initial, companySettings, emailSettings }: SettingsFormProps) {
  const [isPending, startTransition] = useTransition()
  const [status, setStatus] = useState<{ kind: 'success' | 'error'; message: string } | null>(null)
  const [companyStatus, setCompanyStatus] = useState<{ kind: 'success' | 'error'; message: string } | null>(null)
  const [emailStatus, setEmailStatus] = useState<{ kind: 'success' | 'error'; message: string } | null>(null)

  const [minQty, setMinQty] = useState(String(initial.MinQuantityToShow))
  const [usdToCad, setUsdToCad] = useState(String(initial.USDToCADConversion ?? 0))

  const [allowMultipleImages, setAllowMultipleImages] = useState(!!initial.AllowMultipleImages)
  const [enableZoom, setEnableZoom] = useState(!!initial.EnableZoom)
  const [showShopifyImages, setShowShopifyImages] = useState(!!initial.ShowShopifyImages)

  // Company settings state
  const [companyName, setCompanyName] = useState(companySettings.CompanyName)
  const [addressLine1, setAddressLine1] = useState(companySettings.AddressLine1 ?? '')
  const [addressLine2, setAddressLine2] = useState(companySettings.AddressLine2 ?? '')
  const [phone, setPhone] = useState(companySettings.Phone ?? '')
  const [fax, setFax] = useState(companySettings.Fax ?? '')
  const [email, setEmail] = useState(companySettings.Email ?? '')
  const [website, setWebsite] = useState(companySettings.Website ?? '')
  const [logoUrl, setLogoUrl] = useState(companySettings.LogoUrl ?? '')
  const [logoUploading, setLogoUploading] = useState(false)
  const logoInputRef = useRef<HTMLInputElement>(null)

  // Email settings state
  const [fromEmail, setFromEmail] = useState(emailSettings.FromEmail)
  const [fromName, setFromName] = useState(emailSettings.FromName ?? '')
  const [salesTeamEmails, setSalesTeamEmails] = useState(emailSettings.SalesTeamEmails ?? '')
  const [ccEmails, setCcEmails] = useState(emailSettings.CCEmails ?? '')
  const [notifyOnNewOrder, setNotifyOnNewOrder] = useState(emailSettings.NotifyOnNewOrder)
  const [notifyOnOrderUpdate, setNotifyOnOrderUpdate] = useState(emailSettings.NotifyOnOrderUpdate)
  const [sendCustomerConfirmation, setSendCustomerConfirmation] = useState(emailSettings.SendCustomerConfirmation)

  // SMTP settings state
  const [smtpStatus, setSmtpStatus] = useState<{ kind: 'success' | 'error'; message: string } | null>(null)
  const [smtpHost, setSmtpHost] = useState(emailSettings.SmtpHost ?? '')
  const [smtpPort, setSmtpPort] = useState(String(emailSettings.SmtpPort ?? 587))
  const [smtpUser, setSmtpUser] = useState(emailSettings.SmtpUser ?? '')
  const [smtpPassword, setSmtpPassword] = useState(emailSettings.SmtpPassword ?? '')
  const [smtpSecure, setSmtpSecure] = useState(emailSettings.SmtpSecure)

  // Test email state
  const [testEmailAddress, setTestEmailAddress] = useState('')
  const [testEmailStatus, setTestEmailStatus] = useState<{ kind: 'success' | 'error'; message: string } | null>(null)
  const [isTestingEmail, setIsTestingEmail] = useState(false)

  const canSubmit = useMemo(() => !isPending, [isPending])

  function onSave() {
    setStatus(null)
    startTransition(async () => {
      const result = await updateInventorySettings({
        MinQuantityToShow: minQty,
        USDToCADConversion: usdToCad,
        AllowMultipleImages: allowMultipleImages,
        EnableZoom: enableZoom,
        ShowShopifyImages: showShopifyImages,
      })

      if (result.success) setStatus({ kind: 'success', message: result.message ?? 'Saved.' })
      else setStatus({ kind: 'error', message: result.error })
    })
  }

  function onResizeImages() {
    setStatus(null)
    startTransition(async () => {
      const result = await resizeSkuImages300x450()
      if (result.success) setStatus({ kind: 'success', message: result.message ?? 'Done.' })
      else setStatus({ kind: 'error', message: result.error })
    })
  }

  function onMinimizeImages() {
    setStatus(null)
    startTransition(async () => {
      const result = await minimizeBigImages()
      if (result.success) setStatus({ kind: 'success', message: result.message ?? 'Done.' })
      else setStatus({ kind: 'error', message: result.error })
    })
  }

  function onSaveCompanySettings() {
    setCompanyStatus(null)
    startTransition(async () => {
      const result = await updateCompanySettings({
        CompanyName: companyName,
        AddressLine1: addressLine1 || null,
        AddressLine2: addressLine2 || null,
        Phone: phone || null,
        Fax: fax || null,
        Email: email || null,
        Website: website || null,
        LogoUrl: logoUrl || null,
      })

      if (result.success) setCompanyStatus({ kind: 'success', message: result.message ?? 'Saved.' })
      else setCompanyStatus({ kind: 'error', message: result.error })
    })
  }

  async function onUploadLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setLogoUploading(true)
    setCompanyStatus(null)

    try {
      const form = new FormData()
      form.append('file', file)

      const res = await fetch('/api/admin/company/logo', {
        method: 'POST',
        body: form,
      })

      const data = await res.json()

      if (data.success && data.logoUrl) {
        setLogoUrl(data.logoUrl)
        setCompanyStatus({ kind: 'success', message: 'Logo uploaded successfully.' })
      } else {
        setCompanyStatus({ kind: 'error', message: data.error || 'Failed to upload logo' })
      }
    } catch {
      setCompanyStatus({ kind: 'error', message: 'Failed to upload logo' })
    } finally {
      setLogoUploading(false)
      if (logoInputRef.current) logoInputRef.current.value = ''
    }
  }

  async function onRemoveLogo() {
    setLogoUploading(true)
    setCompanyStatus(null)

    try {
      const res = await fetch('/api/admin/company/logo', { method: 'DELETE' })
      const data = await res.json()

      if (data.success) {
        setLogoUrl('')
        setCompanyStatus({ kind: 'success', message: 'Logo removed.' })
      } else {
        setCompanyStatus({ kind: 'error', message: data.error || 'Failed to remove logo' })
      }
    } catch {
      setCompanyStatus({ kind: 'error', message: 'Failed to remove logo' })
    } finally {
      setLogoUploading(false)
    }
  }

  function onSaveEmailSettings() {
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
      })

      if (result.success) setEmailStatus({ kind: 'success', message: result.message ?? 'Saved.' })
      else setEmailStatus({ kind: 'error', message: result.error })
    })
  }

  function onSaveSmtpSettings() {
    setSmtpStatus(null)
    startTransition(async () => {
      const port = parseInt(smtpPort, 10)
      const result = await updateSmtpSettings({
        SmtpHost: smtpHost || null,
        SmtpPort: Number.isFinite(port) ? port : null,
        SmtpUser: smtpUser || null,
        SmtpPassword: smtpPassword || null,
        SmtpSecure: smtpSecure,
      })

      if (result.success) setSmtpStatus({ kind: 'success', message: result.message ?? 'Saved.' })
      else setSmtpStatus({ kind: 'error', message: result.error })
    })
  }

  async function onTestEmail() {
    if (!testEmailAddress.trim()) {
      setTestEmailStatus({ kind: 'error', message: 'Please enter an email address' })
      return
    }

    setTestEmailStatus(null)
    setIsTestingEmail(true)

    try {
      const response = await fetch('/api/admin/email/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testEmailAddress.trim() }),
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
    <div className="space-y-6 max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle>Inventory & Display</CardTitle>
          <CardDescription>Matches legacy InventorySettings.aspx behavior.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-medium">Minimum quantity to show</label>
            <Input
              type="number"
              inputMode="numeric"
              value={minQty}
              onChange={(e) => setMinQty(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">USD → CAD conversion rate</label>
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              value={usdToCad}
              onChange={(e) => setUsdToCad(e.target.value)}
            />
          </div>

          <div className="space-y-3">
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={allowMultipleImages}
                onChange={(e) => setAllowMultipleImages(e.target.checked)}
              />
              Allow multiple images per SKU
            </label>

            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={enableZoom}
                onChange={(e) => setEnableZoom(e.target.checked)}
              />
              Enable image zoom
            </label>

            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={showShopifyImages}
                onChange={(e) => setShowShopifyImages(e.target.checked)}
              />
              Show Shopify images (default)
            </label>
          </div>

          <div className="flex items-center gap-3">
            <Button type="button" onClick={onSave} disabled={!canSubmit}>
              {isPending ? 'Saving...' : 'Save Settings'}
            </Button>

            {status ? (
              <p
                className={
                  status.kind === 'success'
                    ? 'text-sm text-success'
                    : 'text-sm text-destructive'
                }
              >
                {status.message}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Image Maintenance</CardTitle>
          <CardDescription>
            Legacy system resizes/recompresses files in ~/SkuImages/. v2 currently only bumps the
            refresh counter until image storage is defined.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button type="button" variant="outline" onClick={onResizeImages} disabled={!canSubmit}>
            Resize Large Images (300×450)
          </Button>
          <Button type="button" variant="outline" onClick={onMinimizeImages} disabled={!canSubmit}>
            Minimize Big Images
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Company Branding</CardTitle>
          <CardDescription>
            Configure how your company appears on customer-facing documents.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          {/* Company Logo Section */}
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Company Logo</h3>
              <div className="mt-1 h-px bg-border" />
            </div>

            <div className="flex items-start gap-6">
              <div className="relative h-20 w-40 overflow-hidden rounded-md border border-border bg-muted flex items-center justify-center">
                {logoUrl ? (
                  <Image
                    src={logoUrl}
                    alt="Company logo"
                    fill
                    className="object-contain p-2"
                    unoptimized
                  />
                ) : (
                  <span className="text-xs text-muted-foreground">No logo</span>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    onChange={onUploadLogo}
                    className="hidden"
                    id="logo-upload"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => logoInputRef.current?.click()}
                    disabled={logoUploading}
                  >
                    {logoUploading ? 'Uploading...' : 'Upload New Logo'}
                  </Button>
                  {logoUrl && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={onRemoveLogo}
                      disabled={logoUploading}
                    >
                      Remove
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  PNG or SVG recommended · Max 500KB
                </p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Used in: <span className="font-medium text-foreground">Order Confirmation</span> · <span className="font-medium text-foreground">Shipping Invoice</span> · <span className="font-medium text-foreground">Line Sheet</span>
            </p>
          </div>

          {/* Company Details Section */}
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Company Details</h3>
              <div className="mt-1 h-px bg-border" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Company Name *</label>
                <Input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Limeapple"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Website</label>
                <Input
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="www.limeapple.com"
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Used in: <span className="font-medium text-foreground">Order Confirmation</span> · <span className="font-medium text-foreground">Shipping Invoice</span>
            </p>
          </div>

          {/* Address Section */}
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Address</h3>
              <div className="mt-1 h-px bg-border" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Address Line 1</label>
                <Input
                  value={addressLine1}
                  onChange={(e) => setAddressLine1(e.target.value)}
                  placeholder="31 Country Lane Terrace"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Address Line 2</label>
                <Input
                  value={addressLine2}
                  onChange={(e) => setAddressLine2(e.target.value)}
                  placeholder="Calgary, AB Canada T3Z 1H8"
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Used in: <span className="font-medium text-foreground">Shipping Invoice</span>
            </p>
          </div>

          {/* Contact Information Section */}
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Contact Information</h3>
              <div className="mt-1 h-px bg-border" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Phone</label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="1 800 359 5171"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Fax</label>
                <Input
                  value={fax}
                  onChange={(e) => setFax(e.target.value)}
                  placeholder="1 888 226 7189"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="orders@limeapple.com"
              />
            </div>

            <p className="text-xs text-muted-foreground">
              Used in: <span className="font-medium text-foreground">Order Confirmation</span> · <span className="font-medium text-foreground">Shipping Invoice</span>
            </p>
          </div>

          {/* Info note */}
          <div className="rounded-md bg-muted/50 px-4 py-3">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium">Note:</span> Packing Slips do not include company branding (warehouse use only).
            </p>
          </div>

          {/* Save button */}
          <div className="flex items-center gap-3 pt-2">
            <Button type="button" onClick={onSaveCompanySettings} disabled={!canSubmit}>
              {isPending ? 'Saving...' : 'Save Changes'}
            </Button>

            {companyStatus ? (
              <p
                className={
                  companyStatus.kind === 'success'
                    ? 'text-sm text-success'
                    : 'text-sm text-destructive'
                }
              >
                {companyStatus.message}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Email Notifications</CardTitle>
          <CardDescription>
            Configure when and to whom order notification emails are sent.
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
                placeholder="Limeapple Orders"
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
              Comma-separated list of emails to receive order notifications.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">CC Emails</label>
            <Input
              value={ccEmails}
              onChange={(e) => setCcEmails(e.target.value)}
              placeholder="ceo@limeapple.com"
            />
            <p className="text-xs text-muted-foreground">
              Comma-separated list of emails to CC on customer confirmations.
            </p>
          </div>

          <div className="space-y-3">
            <label className="text-sm font-medium">Notification Triggers</label>
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={notifyOnNewOrder}
                onChange={(e) => setNotifyOnNewOrder(e.target.checked)}
              />
              Send notification on new order
            </label>

            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={notifyOnOrderUpdate}
                onChange={(e) => setNotifyOnOrderUpdate(e.target.checked)}
              />
              Send notification when order is updated
            </label>
          </div>

          <div className="space-y-3">
            <label className="text-sm font-medium">Customer Emails</label>
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={sendCustomerConfirmation}
                onChange={(e) => setSendCustomerConfirmation(e.target.checked)}
              />
              Send confirmation email to customer
            </label>
          </div>

          <div className="flex items-center gap-3">
            <Button type="button" onClick={onSaveEmailSettings} disabled={!canSubmit}>
              {isPending ? 'Saving...' : 'Save Email Settings'}
            </Button>

            {emailStatus ? (
              <p
                className={
                  emailStatus.kind === 'success'
                    ? 'text-sm text-success'
                    : 'text-sm text-destructive'
                }
              >
                {emailStatus.message}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>SMTP Configuration</CardTitle>
          <CardDescription>
            Configure SMTP server for sending emails. Falls back to environment variables if not set.
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

            {smtpStatus ? (
              <p
                className={
                  smtpStatus.kind === 'success'
                    ? 'text-sm text-success'
                    : 'text-sm text-destructive'
                }
              >
                {smtpStatus.message}
              </p>
            ) : null}
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
                disabled={isTestingEmail || !canSubmit}
              >
                {isTestingEmail ? 'Sending...' : 'Send Test'}
              </Button>
            </div>
            {testEmailStatus ? (
              <p
                className={
                  testEmailStatus.kind === 'success'
                    ? 'text-sm text-success mt-2'
                    : 'text-sm text-destructive mt-2'
                }
              >
                {testEmailStatus.message}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
