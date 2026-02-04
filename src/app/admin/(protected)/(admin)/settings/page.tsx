import { auth } from '@/lib/auth/providers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { LayoutGrid } from 'lucide-react'

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

      {/* Display Rules - moved to Business Portal */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <LayoutGrid className="size-5" />
                Display Rules
              </CardTitle>
              <CardDescription>
                Availability display configuration has moved to the Business Portal.
              </CardDescription>
            </div>
            <Button asChild>
              <Link href="/admin/business/display-rules">
                Open Business Portal
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Configure which inventory fields show in each view, create calculated fields,
            and control how availability is displayed across your catalogs and exports.
          </p>
        </CardContent>
      </Card>

      <MissingShopifyDataPanels
        missingImages={missingImages}
        missingColors={missingColors}
        missingSizes={missingSizeVariants}
        shopifyStoreDomain={syncSettings.shopifyStoreDomain}
      />
    </div>
  )
}
