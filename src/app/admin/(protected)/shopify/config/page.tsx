/**
 * Shopify Configuration Page
 * ============================================================================
 * Admin interface for configuring Shopify sync:
 * - View available Shopify fields via introspection
 * - Toggle which fields to sync
 * - Configure filters (e.g., only ACTIVE products)
 * - Preview filter impact
 *
 * Path: src/app/admin/(protected)/shopify/config/page.tsx
 */

import { Suspense } from 'react'
import { DeveloperToolsClient } from '@/components/admin/developer/developer-tools-client'

export const dynamic = 'force-dynamic'

export default function ShopifyConfigPage() {
  return (
    <main className="p-10 bg-muted/30 min-h-screen">
      {/* Page Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-4xl font-bold">Sync Configuration</h2>
          <p className="text-muted-foreground mt-1">
            Configure Shopify sync settings, field mappings, and filters
          </p>
        </div>
      </div>

      {/* Main Content */}
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            Loading...
          </div>
        }
      >
        <DeveloperToolsClient />
      </Suspense>
    </main>
  )
}
