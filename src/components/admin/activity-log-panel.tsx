'use client'

import * as React from 'react'
import { Card, CardContent, CardHeader, CardTitle, Button } from '@/components/ui'
import { ChevronDown, ChevronUp, Package, Mail, X, FileText, Truck, User, Clock } from 'lucide-react'
import type { ActivityLogEntry, ActivityAction } from '@/lib/audit/activity-logger'

interface ActivityLogPanelProps {
  entries: ActivityLogEntry[]
  isLoading?: boolean
}

const ACTION_ICONS: Record<string, React.ReactNode> = {
  order_created: <FileText className="h-4 w-4" />,
  order_updated: <FileText className="h-4 w-4" />,
  order_cancelled: <X className="h-4 w-4" />,
  order_status_changed: <FileText className="h-4 w-4" />,
  shipment_created: <Truck className="h-4 w-4" />,
  shipment_voided: <X className="h-4 w-4" />,
  shipment_edited: <Truck className="h-4 w-4" />,
  tracking_added: <Package className="h-4 w-4" />,
  tracking_updated: <Package className="h-4 w-4" />,
  item_cancelled: <X className="h-4 w-4" />,
  item_edited: <FileText className="h-4 w-4" />,
  item_added: <FileText className="h-4 w-4" />,
  item_removed: <X className="h-4 w-4" />,
  document_generated: <FileText className="h-4 w-4" />,
  email_sent: <Mail className="h-4 w-4" />,
  customer_created: <User className="h-4 w-4" />,
  customer_updated: <User className="h-4 w-4" />,
}

const ACTION_COLORS: Record<string, string> = {
  order_created: 'bg-green-100 text-green-700',
  order_cancelled: 'bg-red-100 text-red-700',
  shipment_created: 'bg-blue-100 text-blue-700',
  shipment_voided: 'bg-red-100 text-red-700',
  item_cancelled: 'bg-red-100 text-red-700',
  email_sent: 'bg-purple-100 text-purple-700',
  default: 'bg-gray-100 text-gray-700',
}

function getDateLabel(date: Date): string {
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const yesterdayOnly = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate())

  if (dateOnly.getTime() === todayOnly.getTime()) {
    return 'Today'
  }
  if (dateOnly.getTime() === yesterdayOnly.getTime()) {
    return 'Yesterday'
  }
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function groupEntriesByDate(entries: ActivityLogEntry[]): Map<string, ActivityLogEntry[]> {
  const groups = new Map<string, ActivityLogEntry[]>()

  for (const entry of entries) {
    const label = getDateLabel(entry.timestamp)
    if (!groups.has(label)) {
      groups.set(label, [])
    }
    groups.get(label)!.push(entry)
  }

  return groups
}

export function ActivityLogPanel({ entries, isLoading }: ActivityLogPanelProps) {
  const [isExpanded, setIsExpanded] = React.useState(false)
  const [showAll, setShowAll] = React.useState(false)

  const displayEntries = showAll ? entries : entries.slice(0, 10)
  const groupedEntries = groupEntriesByDate(displayEntries)

  return (
    <Card>
      <CardHeader
        className="cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Activity Log</CardTitle>
            <span className="text-sm text-muted-foreground">
              ({entries.length} {entries.length === 1 ? 'entry' : 'entries'})
            </span>
          </div>
          <Button variant="ghost" size="sm">
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No activity recorded yet.
            </div>
          ) : (
            <div className="space-y-6">
              {Array.from(groupedEntries.entries()).map(([dateLabel, dateEntries]) => (
                <div key={dateLabel}>
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                    <div className="h-px flex-1 bg-border" />
                    <span>{dateLabel}</span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                  <div className="space-y-3">
                    {dateEntries.map((entry) => {
                      const icon = ACTION_ICONS[entry.action] || <FileText className="h-4 w-4" />
                      const colorClass = ACTION_COLORS[entry.action] || ACTION_COLORS.default

                      return (
                        <div
                          key={entry.id}
                          className="flex items-start gap-3 text-sm"
                        >
                          <div className={`p-1.5 rounded-full ${colorClass}`}>
                            {icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-foreground">
                              {entry.description || formatActionName(entry.action)}
                            </div>
                            {entry.newValues && Object.keys(entry.newValues).length > 0 && (
                              <div className="text-xs text-muted-foreground mt-0.5">
                                {formatDetails(entry.newValues)}
                              </div>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground whitespace-nowrap text-right">
                            <div>{formatTime(entry.timestamp)}</div>
                            {entry.performedBy && (
                              <div className="text-muted-foreground/70">{entry.performedBy}</div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}

              {entries.length > 10 && !showAll && (
                <div className="text-center pt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAll(true)}
                  >
                    Show {entries.length - 10} more entries...
                  </Button>
                </div>
              )}

              {showAll && entries.length > 10 && (
                <div className="text-center pt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAll(false)}
                  >
                    Show less
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}

function formatActionName(action: ActivityAction): string {
  return action
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function formatDetails(values: Record<string, unknown>): string {
  const parts: string[] = []

  if (values.unitsShipped) {
    parts.push(`${values.unitsShipped} units shipped`)
  }
  if (values.totalAmount) {
    parts.push(`$${Number(values.totalAmount).toFixed(2)}`)
  }
  if (values.reason) {
    parts.push(`Reason: ${values.reason}`)
  }
  if (values.sku) {
    parts.push(`SKU: ${values.sku}`)
  }
  if (values.quantity) {
    parts.push(`Qty: ${values.quantity}`)
  }

  return parts.join(' | ')
}
