import { auth } from '@/lib/auth/providers'
import { redirect } from 'next/navigation'
import {
  getInventorySettings,
  getCompanySettings,
  getSizeOrderConfig,
  getDistinctSizes,
  getMissingSizeVariants,
  getSizeAliases,
  getSyncSettings,
  getMissingImageProducts,
  getMissingColorProducts,
} from '@/lib/data/queries/settings'
import { SettingsForm } from '@/components/admin/settings-form'
import { SizeOrderConfig } from '@/components/admin/size-order-config'
import { MissingShopifyDataPanels } from '@/components/admin/missing-shopify-data-panels'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const session = await auth()
  if (!session?.user || session.user.role !== 'admin') {
    redirect('/admin/login')
  }

  const [settings, companySettings, sizeOrderConfig, distinctSizes, missingSizeVariants, aliases, syncSettings, missingImages, missingColors] = await Promise.all([
    getInventorySettings(),
    getCompanySettings(),
    getSizeOrderConfig(),
    getDistinctSizes(),
    getMissingSizeVariants(),
    getSizeAliases(),
    getSyncSettings(),
    getMissingImageProducts(),
    getMissingColorProducts(),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Size Mapping and Order</h1>
        <p className="text-muted-foreground">
          Configure how sizes are mapped and sorted across the system
        </p>
      </div>

      <SettingsForm initial={settings} companySettings={companySettings} />

      <SizeOrderConfig
        initialSizes={sizeOrderConfig.Sizes}
        initialValidatedSizes={sizeOrderConfig.ValidatedSizes}
        distinctSizes={distinctSizes}
        aliases={aliases}
      />

      <MissingShopifyDataPanels
        missingImages={missingImages}
        missingColors={missingColors}
        missingSizes={missingSizeVariants}
        shopifyStoreDomain={syncSettings.shopifyStoreDomain}
      />
    </div>
  )
}
