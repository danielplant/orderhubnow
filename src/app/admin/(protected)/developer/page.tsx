/**
 * Developer Tools Page
 *
 * Admin interface for configuring Shopify sync:
 * - View available Shopify fields via introspection
 * - Toggle which fields to sync
 * - Configure filters (e.g., only ACTIVE products)
 * - Preview filter impact
 */

import { Suspense } from 'react'
import { DeveloperToolsClient } from '@/components/admin/developer/developer-tools-client'

export const dynamic = 'force-dynamic'

export default function DeveloperPage() {
  return (
    <main className="p-10 bg-muted/30 min-h-screen">
      {/* Page Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-4xl font-bold">Developer Tools</h2>
          <p className="text-muted-foreground mt-1">
            Configure Shopify sync settings and field mappings
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
