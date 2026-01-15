'use client'

import * as React from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, Button } from '@/components/ui'
import { formatCurrency } from '@/lib/utils'
import { Package, ArrowRight, Clock, AlertTriangle } from 'lucide-react'
import type { OpenItemsSummary } from '@/lib/data/queries/open-items'

interface OpenItemsWidgetProps {
  summary: OpenItemsSummary
}

export function OpenItemsWidget({ summary }: OpenItemsWidgetProps) {
  const { totalOpenItems, totalOpenUnits, totalOpenValue, totalOrders } = summary

  // Determine urgency level
  const urgencyLevel = 
    totalOpenItems === 0 ? 'none' :
    totalOpenUnits > 100 ? 'high' :
    totalOpenUnits > 50 ? 'medium' : 'low'

  const urgencyColors = {
    none: 'text-success',
    low: 'text-info',
    medium: 'text-warning',
    high: 'text-destructive',
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <Package className="h-4 w-4" />
          Open Items
        </CardTitle>
        <Button variant="ghost" size="sm" className="text-xs gap-1" asChild>
          <Link href="/admin/open-items">
            View All
            <ArrowRight className="h-3 w-3" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {totalOpenItems === 0 ? (
          <div className="text-center py-6">
            <div className="text-success text-lg font-semibold">All Caught Up!</div>
            <p className="text-sm text-muted-foreground">No open items requiring fulfillment</p>
          </div>
        ) : (
          <>
            {/* Main stat */}
            <div className="flex items-center justify-between">
              <div>
                <div className={`text-2xl font-bold ${urgencyColors[urgencyLevel]}`}>
                  {totalOpenUnits.toLocaleString()}
                </div>
                <div className="text-sm text-muted-foreground">Open Units</div>
              </div>
              <div className="text-right">
                <div className="text-lg font-semibold">
                  {formatCurrency(totalOpenValue, 'USD')}
                </div>
                <div className="text-sm text-muted-foreground">Total Value</div>
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 gap-4 pt-2 border-t">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <div>
                  <div className="font-medium">{totalOpenItems}</div>
                  <div className="text-xs text-muted-foreground">Line Items</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                <div>
                  <div className="font-medium">{totalOrders}</div>
                  <div className="text-xs text-muted-foreground">Orders</div>
                </div>
              </div>
            </div>

            {/* Quick action */}
            <Button className="w-full" size="sm" variant="outline" asChild>
              <Link href="/admin/open-items">
                Manage Open Items
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
