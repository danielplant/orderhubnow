'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const SCENARIOS = [
  {
    key: 'ats',
    label: 'ATS (Available to Ship)',
    description: 'Products that are in stock and ready to ship from the warehouse.',
    badge: 'Active',
  },
  {
    key: 'preorder_po',
    label: 'PreOrder (PO Placed)',
    description: 'Products with a factory purchase order placed. Quantities are known and limited.',
    badge: 'Active',
  },
  {
    key: 'preorder_no_po',
    label: 'PreOrder (No PO Yet)',
    description: 'Products available for pre-order with no factory limits. Ordering is unlimited.',
    badge: 'Active',
  },
]

export function ScenariosTab() {
  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        Scenarios define the different inventory states your products can be in.
        Each scenario can have its own display rules.
      </div>

      <div className="grid gap-4">
        {SCENARIOS.map((scenario) => (
          <Card key={scenario.key}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{scenario.label}</CardTitle>
                <span className="text-xs bg-muted border border-border px-2 py-0.5 rounded">{scenario.badge}</span>
              </div>
              <CardDescription>{scenario.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-xs text-muted-foreground">
                Key: <code className="bg-muted px-1 py-0.5 rounded">{scenario.key}</code>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="rounded-lg border bg-muted/30 p-4">
        <p className="text-sm text-muted-foreground">
          <strong>Note:</strong> Custom scenarios are planned for a future release. Currently,
          these three scenarios cover all inventory states.
        </p>
      </div>
    </div>
  )
}
