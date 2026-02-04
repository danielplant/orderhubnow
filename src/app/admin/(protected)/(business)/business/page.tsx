import Link from 'next/link'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { LayoutGrid } from 'lucide-react'

export default function BusinessPortalPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Business Portal</h1>
        <p className="text-muted-foreground">
          Configure how your business displays inventory and product information.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Link href="/admin/business/display-rules">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
            <CardHeader>
              <div className="flex items-center gap-3">
                <LayoutGrid className="size-5 text-muted-foreground" />
                <div>
                  <CardTitle className="text-base">Display Rules</CardTitle>
                  <CardDescription>
                    Configure which inventory fields show in each view, create calculated
                    fields, and control how availability is displayed across your catalogs.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>
        </Link>
      </div>

      <div className="rounded-lg border bg-muted/30 p-4">
        <p className="text-sm text-muted-foreground">
          <strong>Tip:</strong> Display Rules let you control exactly what inventory numbers
          your buyers and reps see. You can create custom formulas and assign them to different
          views like Admin tables, Buyer catalogs, and PDF/XLSX exports.
        </p>
      </div>
    </div>
  )
}
