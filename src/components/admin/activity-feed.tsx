'use client'

/**
 * Activity Feed Component
 * 
 * Displays a timeline of activity for an entity (order, shipment, etc.)
 */

import * as React from 'react'
import { Button } from '@/components/ui'
import { 
  Package, 
  Truck, 
  XCircle, 
  FileText, 
  Mail, 
  Edit, 
  Plus,
  ChevronDown,
  ChevronUp,
  Clock
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ActivityLogEntry, ActivityAction } from '@/lib/audit/activity-logger'

interface ActivityFeedProps {
  activities: ActivityLogEntry[]
  maxItems?: number
  collapsible?: boolean
  defaultExpanded?: boolean
}

function getActionIcon(action: ActivityAction) {
  switch (action) {
    case 'shipment_created':
      return <Truck className="h-4 w-4" />
    case 'shipment_voided':
      return <XCircle className="h-4 w-4" />
    case 'shipment_edited':
      return <Edit className="h-4 w-4" />
    case 'item_cancelled':
      return <XCircle className="h-4 w-4" />
    case 'item_added':
      return <Plus className="h-4 w-4" />
    case 'document_generated':
      return <FileText className="h-4 w-4" />
    case 'email_sent':
      return <Mail className="h-4 w-4" />
    case 'tracking_added':
    case 'tracking_updated':
      return <Package className="h-4 w-4" />
    default:
      return <Clock className="h-4 w-4" />
  }
}

function getActionColor(action: ActivityAction): string {
  switch (action) {
    case 'shipment_created':
      return 'bg-green-100 text-green-600 border-green-200'
    case 'shipment_voided':
    case 'item_cancelled':
      return 'bg-red-100 text-red-600 border-red-200'
    case 'document_generated':
      return 'bg-blue-100 text-blue-600 border-blue-200'
    case 'email_sent':
      return 'bg-purple-100 text-purple-600 border-purple-200'
    case 'tracking_added':
    case 'tracking_updated':
      return 'bg-cyan-100 text-cyan-600 border-cyan-200'
    default:
      return 'bg-gray-100 text-gray-600 border-gray-200'
  }
}

function formatTimestamp(date: Date): string {
  const now = new Date()
  const diff = now.getTime() - new Date(date).getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`

  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function ActivityItem({ activity }: { activity: ActivityLogEntry }) {
  return (
    <div className="flex gap-3">
      {/* Icon */}
      <div
        className={cn(
          'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center border',
          getActionColor(activity.action)
        )}
      >
        {getActionIcon(activity.action)}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pt-0.5">
        <p className="text-sm text-foreground">{activity.description}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-muted-foreground">
            {formatTimestamp(activity.timestamp)}
          </span>
          {activity.performedBy && (
            <>
              <span className="text-xs text-muted-foreground">•</span>
              <span className="text-xs text-muted-foreground">{activity.performedBy}</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export function ActivityFeed({
  activities,
  maxItems = 10,
  collapsible = true,
  defaultExpanded = false,
}: ActivityFeedProps) {
  const [isExpanded, setIsExpanded] = React.useState(defaultExpanded)
  const [showAll, setShowAll] = React.useState(false)

  if (activities.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground text-sm">
        No activity recorded yet.
      </div>
    )
  }

  const displayedActivities = showAll ? activities : activities.slice(0, maxItems)
  const hasMore = activities.length > maxItems

  return (
    <div className="space-y-4">
      {/* Header */}
      {collapsible && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center justify-between w-full text-left"
        >
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            Activity ({activities.length})
          </h3>
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
      )}

      {/* Timeline */}
      {(!collapsible || isExpanded) && (
        <div className="space-y-4 pl-1">
          {displayedActivities.map((activity) => (
            <ActivityItem key={activity.id} activity={activity} />
          ))}

          {/* Show more button */}
          {hasMore && !showAll && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAll(true)}
              className="w-full text-muted-foreground"
            >
              Show {activities.length - maxItems} more activities
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

export default ActivityFeed
