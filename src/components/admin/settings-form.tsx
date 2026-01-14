'use client'

import { useMemo, useState, useTransition } from 'react'
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

  // Email settings state
  const [fromEmail, setFromEmail] = useState(emailSettings.FromEmail)
  const [fromName, setFromName] = useState(emailSettings.FromName ?? '')
  const [salesTeamEmails, setSalesTeamEmails] = useState(emailSettings.SalesTeamEmails ?? '')
  const [ccEmails, setCcEmails] = useState(emailSettings.CCEmails ?? '')
  const [notifyOnNewOrder, setNotifyOnNewOrder] = useState(emailSettings.NotifyOnNewOrder)
  const [notifyOnOrderUpdate, setNotifyOnOrderUpdate] = useState(emailSettings.NotifyOnOrderUpdate)
  const [sendCustomerConfirmation, setSendCustomerConfirmation] = useState(emailSettings.SendCustomerConfirmation)

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
          <CardTitle>Company / PDF Settings</CardTitle>
          <CardDescription>
            Company information displayed on order PDFs (Order Summary header).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Company Name *</label>
              <Input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="limeapple"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Logo URL</label>
              <Input
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="/logos/limeapple-logo.png"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Address Line 1</label>
              <Input
                value={addressLine1}
                onChange={(e) => setAddressLine1(e.target.value)}
                placeholder="31 COUNTRY LANE TERRACE"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Address Line 2</label>
              <Input
                value={addressLine2}
                onChange={(e) => setAddressLine2(e.target.value)}
                placeholder="CALGARY, AB CANADA T3Z 1H8"
              />
            </div>
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

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="sales@limeapple.com"
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

          <div className="flex items-center gap-3">
            <Button type="button" onClick={onSaveCompanySettings} disabled={!canSubmit}>
              {isPending ? 'Saving...' : 'Save Company Settings'}
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
    </div>
  )
}
