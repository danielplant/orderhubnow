import { getReps } from '@/lib/data/queries/reps'
import { RepsTable } from '@/components/admin/reps-table'

export const dynamic = 'force-dynamic'

export default async function RepsPage() {
  const result = await getReps()

  return (
    <main className="p-10 bg-muted/30 min-h-screen">
      <div className="mb-6">
        <h2 className="text-4xl font-bold text-foreground">Sales Reps</h2>
        <p className="text-muted-foreground mt-1">
          Manage sales representatives and their login credentials.
        </p>
      </div>

      <RepsTable items={result.items} />
    </main>
  )
}
