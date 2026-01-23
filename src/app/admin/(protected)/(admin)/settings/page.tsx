import { auth } from '@/lib/auth/providers'
import { redirect } from 'next/navigation'
import {
  getInventorySettings,
  getCompanySettings,
  getEmailSettings,
  getSizeOrderConfig,
} from '@/lib/data/queries/settings'
import { SettingsForm } from '@/components/admin/settings-form'
import { SizeOrderConfig } from '@/components/admin/size-order-config'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const session = await auth()
  if (!session?.user || session.user.role !== 'admin') {
    redirect('/admin/login')
  }

  const [settings, companySettings, emailSettings, sizeOrderConfig] = await Promise.all([
    getInventorySettings(),
    getCompanySettings(),
    getEmailSettings(),
    getSizeOrderConfig(),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          System configuration (InventorySettings.aspx parity)
        </p>
      </div>

      <SettingsForm initial={settings} companySettings={companySettings} emailSettings={emailSettings} />

      <SizeOrderConfig initialSizes={sizeOrderConfig.Sizes} />
    </div>
  )
}
