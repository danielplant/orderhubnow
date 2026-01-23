import Link from 'next/link'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Database, Settings, GitBranch, Search } from 'lucide-react'

export default function DevPortalPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Developer Portal</h1>
        <p className="text-muted-foreground">
          Technical tools for Shopify integration and data configuration.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Link href="/admin/dev/shopify">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
            <CardHeader>
              <div className="flex items-center gap-3">
                <Database className="size-5 text-muted-foreground" />
                <div>
                  <CardTitle className="text-base">Shopify Integration</CardTitle>
                  <CardDescription>
                    Sync status, run syncs, manage mappings and schedules.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/admin/dev/field-config">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
            <CardHeader>
              <div className="flex items-center gap-3">
                <Settings className="size-5 text-muted-foreground" />
                <div>
                  <CardTitle className="text-base">Field Configuration</CardTitle>
                  <CardDescription>
                    Configure which fields to sync from Shopify.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/admin/dev/status-pipeline">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
            <CardHeader>
              <div className="flex items-center gap-3">
                <GitBranch className="size-5 text-muted-foreground" />
                <div>
                  <CardTitle className="text-base">Status Pipeline</CardTitle>
                  <CardDescription>
                    Configure status cascade rules for products.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/admin/dev/schema">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
            <CardHeader>
              <div className="flex items-center gap-3">
                <Search className="size-5 text-muted-foreground" />
                <div>
                  <CardTitle className="text-base">Schema Discovery</CardTitle>
                  <CardDescription>
                    Explore Shopify GraphQL schema and available fields.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>
        </Link>
      </div>

      <div className="rounded-lg border bg-muted/30 p-4">
        <p className="text-sm text-muted-foreground">
          <strong>Note:</strong> These tools are for technical configuration. Shopify Integration
          is fully functional. Field Configuration, Status Pipeline, and Schema Discovery are
          planned for future releases.
        </p>
      </div>
    </div>
  )
}
