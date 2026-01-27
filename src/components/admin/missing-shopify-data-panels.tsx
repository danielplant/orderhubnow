'use client'

import { useState } from 'react'
import { AlertTriangle, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { MissingDataItem, MissingSizeItem } from '@/lib/data/queries/settings'

interface MissingShopifyDataPanelsProps {
  missingImages: MissingDataItem[]
  missingColors: MissingDataItem[]
  missingSizes: MissingSizeItem[]
  shopifyStoreDomain: string | null
}

/**
 * Build a Shopify admin URL for a product.
 * Returns null if the store domain is not set.
 */
function buildShopifyUrl(shopifyProductId: string | null, shopifyStoreDomain: string | null): string | null {
  if (!shopifyProductId || !shopifyStoreDomain) return null

  const subdomain = shopifyStoreDomain.replace('.myshopify.com', '')
  const numericId = shopifyProductId.replace('gid://shopify/Product/', '')

  return `https://admin.shopify.com/store/${subdomain}/products/${numericId}`
}

/**
 * Build a Shopify admin URL for a specific variant.
 * ShopifyProductId is GID format (needs prefix stripped).
 * ShopifyProductVariantId is already numeric (BigInt converted to string).
 * Returns null if required IDs are missing.
 */
function buildVariantUrl(
  shopifyProductId: string | null,
  shopifyVariantId: string | null,
  shopifyStoreDomain: string | null
): string | null {
  if (!shopifyProductId || !shopifyVariantId || !shopifyStoreDomain) return null

  const subdomain = shopifyStoreDomain.replace('.myshopify.com', '')
  const numericProductId = shopifyProductId.replace('gid://shopify/Product/', '')
  // Variant ID is already numeric (BigInt converted to string)
  const numericVariantId = shopifyVariantId

  return `https://admin.shopify.com/store/${subdomain}/products/${numericProductId}/variants/${numericVariantId}`
}

export function MissingShopifyDataPanels({
  missingImages,
  missingColors,
  missingSizes,
  shopifyStoreDomain,
}: MissingShopifyDataPanelsProps) {
  const [showImagesModal, setShowImagesModal] = useState(false)
  const [showColorsModal, setShowColorsModal] = useState(false)
  const [showSizesModal, setShowSizesModal] = useState(false)

  const hasStoreDomain = !!shopifyStoreDomain && shopifyStoreDomain.trim() !== ''

  return (
    <Card>
      <CardHeader>
        <CardTitle>Missing Shopify Data</CardTitle>
        <CardDescription>
          Products missing required fields in Shopify. Fix them in Shopify Admin and run a sync.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Missing Images Section */}
        {missingImages.length > 0 ? (
          <div className="space-y-3 p-4 rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                <h3 className="text-sm font-medium text-red-700 dark:text-red-400">
                  Missing Images ({missingImages.length} products)
                </h3>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowImagesModal(true)}
              >
                View Details
              </Button>
            </div>
            <p className="text-sm text-red-600 dark:text-red-300">
              These products have no image in Shopify. Add a featured image or gallery image.
            </p>
          </div>
        ) : (
          <div className="p-4 rounded-lg border border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800">
            <p className="text-sm text-green-700 dark:text-green-300">
              All products have images.
            </p>
          </div>
        )}

        {/* Missing Colors Section */}
        {missingColors.length > 0 ? (
          <div className="space-y-3 p-4 rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                <h3 className="text-sm font-medium text-red-700 dark:text-red-400">
                  Missing Colors ({missingColors.length} products)
                </h3>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowColorsModal(true)}
              >
                View Details
              </Button>
            </div>
            <p className="text-sm text-red-600 dark:text-red-300">
              These products have no color metafield in Shopify. Set the custom.color metafield.
            </p>
          </div>
        ) : (
          <div className="p-4 rounded-lg border border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800">
            <p className="text-sm text-green-700 dark:text-green-300">
              All products have colors.
            </p>
          </div>
        )}

        {/* Missing Sizes Section */}
        {missingSizes.length > 0 ? (
          <div className="space-y-3 p-4 rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                <h3 className="text-sm font-medium text-red-700 dark:text-red-400">
                  Missing Sizes ({missingSizes.length} variants)
                </h3>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowSizesModal(true)}
              >
                View Details
              </Button>
            </div>
            <p className="text-sm text-red-600 dark:text-red-300">
              These variants have no size option in Shopify. Set the Size option on the variant.
            </p>
          </div>
        ) : (
          <div className="p-4 rounded-lg border border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800">
            <p className="text-sm text-green-700 dark:text-green-300">
              All variants have sizes.
            </p>
          </div>
        )}

        {/* Missing Images Modal */}
        <Dialog open={showImagesModal} onOpenChange={setShowImagesModal}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>Missing Image Products</DialogTitle>
              <DialogDescription>
                These products have no image in Shopify. Add a featured image or gallery image, then run a sync.
              </DialogDescription>
            </DialogHeader>
            {!hasStoreDomain && (
              <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800">
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  Set Shopify Store Domain in Sync Settings to enable Shopify links.
                </p>
              </div>
            )}
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Product ID</th>
                    <th className="px-3 py-2 font-medium">Title</th>
                    <th className="px-3 py-2 font-medium">Variants</th>
                    <th className="px-3 py-2 font-medium">Example SKU</th>
                    <th className="px-3 py-2 font-medium">Shopify</th>
                  </tr>
                </thead>
                <tbody>
                  {missingImages.map((item, idx) => {
                    const shopifyUrl = buildShopifyUrl(item.shopifyProductId, shopifyStoreDomain)
                    return (
                      <tr key={item.shopifyProductId || idx} className="border-t">
                        <td className="px-3 py-2 font-mono text-xs">
                          {item.shopifyProductId?.replace('gid://shopify/Product/', '') || '-'}
                        </td>
                        <td className="px-3 py-2 text-sm max-w-[200px] truncate" title={item.title}>
                          {item.title}
                        </td>
                        <td className="px-3 py-2 text-center">{item.variantCount}</td>
                        <td className="px-3 py-2 font-mono text-xs">{item.exampleSku}</td>
                        <td className="px-3 py-2">
                          {shopifyUrl ? (
                            <a
                              href={shopifyUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                            >
                              Open <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowImagesModal(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Missing Colors Modal */}
        <Dialog open={showColorsModal} onOpenChange={setShowColorsModal}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>Missing Color Products</DialogTitle>
              <DialogDescription>
                These products have no color metafield in Shopify. Set the custom.color metafield, then run a sync.
              </DialogDescription>
            </DialogHeader>
            {!hasStoreDomain && (
              <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800">
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  Set Shopify Store Domain in Sync Settings to enable Shopify links.
                </p>
              </div>
            )}
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Product ID</th>
                    <th className="px-3 py-2 font-medium">Title</th>
                    <th className="px-3 py-2 font-medium">Variants</th>
                    <th className="px-3 py-2 font-medium">Example SKU</th>
                    <th className="px-3 py-2 font-medium">Shopify</th>
                  </tr>
                </thead>
                <tbody>
                  {missingColors.map((item, idx) => {
                    const shopifyUrl = buildShopifyUrl(item.shopifyProductId, shopifyStoreDomain)
                    return (
                      <tr key={item.shopifyProductId || idx} className="border-t">
                        <td className="px-3 py-2 font-mono text-xs">
                          {item.shopifyProductId?.replace('gid://shopify/Product/', '') || '-'}
                        </td>
                        <td className="px-3 py-2 text-sm max-w-[200px] truncate" title={item.title}>
                          {item.title}
                        </td>
                        <td className="px-3 py-2 text-center">{item.variantCount}</td>
                        <td className="px-3 py-2 font-mono text-xs">{item.exampleSku}</td>
                        <td className="px-3 py-2">
                          {shopifyUrl ? (
                            <a
                              href={shopifyUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                            >
                              Open <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowColorsModal(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Missing Sizes Modal */}
        <Dialog open={showSizesModal} onOpenChange={setShowSizesModal}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>Missing Size Variants</DialogTitle>
              <DialogDescription>
                These variants have no size option in Shopify. Set the Size option on each variant, then run a sync.
              </DialogDescription>
            </DialogHeader>
            {!hasStoreDomain && (
              <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800">
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  Set Shopify Store Domain in Sync Settings to enable Shopify links.
                </p>
              </div>
            )}
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="px-3 py-2 font-medium">SKU ID</th>
                    <th className="px-3 py-2 font-medium">Description</th>
                    <th className="px-3 py-2 font-medium">Shopify</th>
                  </tr>
                </thead>
                <tbody>
                  {missingSizes.map((item, idx) => {
                    const shopifyUrl = buildVariantUrl(item.shopifyProductId, item.shopifyVariantId, shopifyStoreDomain)
                    return (
                      <tr key={item.skuId || idx} className="border-t">
                        <td className="px-3 py-2 font-mono text-xs">{item.skuId}</td>
                        <td className="px-3 py-2 text-sm max-w-[300px] truncate" title={item.description ?? ''}>
                          {item.description || '-'}
                        </td>
                        <td className="px-3 py-2">
                          {shopifyUrl ? (
                            <a
                              href={shopifyUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                            >
                              Open Variant <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowSizesModal(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}
