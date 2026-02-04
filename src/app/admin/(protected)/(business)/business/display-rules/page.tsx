import { Suspense } from 'react'
import { DisplayRulesClient } from './display-rules-client'

export const dynamic = 'force-dynamic'

export default function DisplayRulesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Display Rules</h1>
        <p className="text-muted-foreground">
          Configure how inventory numbers appear across your catalogs, exports, and buyer views.
        </p>
      </div>

      <Suspense fallback={<div className="text-muted-foreground">Loading...</div>}>
        <DisplayRulesClient />
      </Suspense>
    </div>
  )
}
