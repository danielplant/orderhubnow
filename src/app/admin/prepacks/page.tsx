import { getPPSizes } from '@/lib/data/queries/prepacks'
import { PrepacksTable } from '@/components/admin/prepacks-table'

export const dynamic = 'force-dynamic'

export default async function PrepacksPage() {
  const result = await getPPSizes()

  return (
    <main className="p-10 bg-muted/30 min-h-screen">
      <div className="mb-6">
        <h2 className="text-4xl font-bold text-foreground">Prepack Configurations</h2>
        <p className="text-muted-foreground mt-1">
          Manage size-to-prepack mappings for inventory calculations.
        </p>
      </div>

      <PrepacksTable items={result.items} />
    </main>
  )
}
