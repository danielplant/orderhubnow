'use client'

import Link from 'next/link'
import type { FeatureInterestRow } from '@/lib/data/queries/feature-interest'

interface FeatureInterestTableProps {
  entries: FeatureInterestRow[]
}

export function FeatureInterestTable({ entries }: FeatureInterestTableProps) {
  return (
    <div className="rounded-lg border border-border bg-background overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 border-b border-border">
          <tr>
            <th className="text-left p-3 font-medium">Feature</th>
            <th className="text-left p-3 font-medium">User</th>
            <th className="text-left p-3 font-medium">Selected Options</th>
            <th className="text-left p-3 font-medium">Comments</th>
            <th className="text-left p-3 font-medium">Order</th>
            <th className="text-left p-3 font-medium">Date</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {entries.map((entry) => (
            <tr key={entry.id} className="hover:bg-muted/30 transition-colors">
              <td className="p-3">
                <span className="inline-block px-2.5 py-1 bg-primary/10 text-primary rounded-full text-xs font-medium">
                  {entry.feature}
                </span>
              </td>
              <td className="p-3 text-muted-foreground">
                {entry.userId || '—'}
              </td>
              <td className="p-3">
                {entry.selectedOptions.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {entry.selectedOptions.map((opt, i) => (
                      <span
                        key={i}
                        className="inline-block px-2 py-0.5 bg-muted rounded text-xs"
                      >
                        {opt}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="p-3 max-w-xs">
                {entry.freeText ? (
                  <span className="line-clamp-2" title={entry.freeText}>
                    {entry.freeText}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="p-3">
                {entry.orderNumber ? (
                  <Link
                    href={`/admin/orders/${entry.orderId}`}
                    className="text-primary hover:underline font-mono text-xs"
                  >
                    {entry.orderNumber}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="p-3 text-muted-foreground whitespace-nowrap">
                {new Date(entry.createdAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
