import {
  getFeatureInterestList,
  getFeatureInterestSummary,
  getFeatureNames,
} from '@/lib/data/queries/feature-interest'
import { Card, CardContent } from '@/components/ui'
import { MessageSquarePlus, Download } from 'lucide-react'
import { FeatureInterestTable } from './table'
import { FeatureFilter } from './filter'

export const dynamic = 'force-dynamic'

export default async function FeatureInterestPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const filterFeature = typeof sp.feature === 'string' ? sp.feature : undefined

  const [entries, summary, featureNames] = await Promise.all([
    getFeatureInterestList(filterFeature),
    getFeatureInterestSummary(),
    getFeatureNames(),
  ])

  const totalCount = summary.reduce((sum, s) => sum + s.count, 0)

  return (
    <main className="p-10 bg-muted/30 min-h-screen">
      <div className="mb-6">
        <h2 className="text-4xl font-bold text-foreground">Feature Interest</h2>
        <p className="text-muted-foreground mt-1">
          Track user interest and expectations for upcoming features.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <MessageSquarePlus className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalCount}</p>
                <p className="text-sm text-muted-foreground">Total Responses</p>
              </div>
            </div>
          </CardContent>
        </Card>
        {summary.slice(0, 3).map((s) => (
          <Card key={s.feature}>
            <CardContent className="pt-6">
              <div>
                <p className="text-2xl font-bold">{s.count}</p>
                <p className="text-sm text-muted-foreground truncate">{s.feature}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter and Export */}
      <div className="flex items-center justify-between mb-4">
        <FeatureFilter
          featureNames={featureNames}
          currentFilter={filterFeature}
        />
        <a
          href={`/api/feature-interest/export${filterFeature ? `?feature=${filterFeature}` : ''}`}
          className="inline-flex items-center gap-2 h-9 px-4 rounded-md border border-input bg-background text-sm hover:bg-muted transition-colors"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </a>
      </div>

      {/* Table */}
      {entries.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <MessageSquarePlus className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-lg font-medium">No responses yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Feature interest will appear here when users interact with &quot;Coming Soon&quot; features.
            </p>
          </CardContent>
        </Card>
      ) : (
        <FeatureInterestTable entries={entries} />
      )}
    </main>
  )
}
