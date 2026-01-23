'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Mail, CheckCircle2, XCircle, RefreshCw, ExternalLink } from 'lucide-react'
import { Card, CardContent, Button } from '@/components/ui'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { FilterPill } from '@/components/ui/filter-pill'
import { SearchInput } from '@/components/ui/search-input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { formatDateTime } from '@/lib/utils/format'
import type { EmailLogEntry, EmailLogStats } from '@/lib/data/queries/email-logs'
import type { EmailType } from '@/lib/audit/activity-logger'

// ============================================================================
// Types
// ============================================================================

interface EmailLogsTabProps {
  initialLogs: EmailLogEntry[]
  initialStats: EmailLogStats
}

const EMAIL_TYPE_LABELS: Record<EmailType, string> = {
  order_confirmation: 'Order Confirmation',
  order_update: 'Order Update',
  sales_notification: 'Sales Notification',
  shipment_confirmation: 'Shipment Confirmation',
  tracking_update: 'Tracking Update',
  rep_notification: 'Rep Notification',
  password_reset: 'Password Reset',
  test_email: 'Test Email',
}

const EMAIL_TYPE_OPTIONS = [
  { value: 'order_confirmation', label: 'Order Confirmation' },
  { value: 'order_update', label: 'Order Update' },
  { value: 'sales_notification', label: 'Sales Notification' },
  { value: 'shipment_confirmation', label: 'Shipment Confirmation' },
  { value: 'tracking_update', label: 'Tracking Update' },
  { value: 'rep_notification', label: 'Rep Notification' },
  { value: 'password_reset', label: 'Password Reset' },
  { value: 'test_email', label: 'Test Email' },
]

const STATUS_OPTIONS = [
  { value: 'sent', label: 'Sent' },
  { value: 'failed', label: 'Failed' },
  { value: 'skipped', label: 'Skipped' },
]

// ============================================================================
// Component
// ============================================================================

export function EmailLogsTab({ initialLogs, initialStats }: EmailLogsTabProps) {
  const router = useRouter()

  // Filters
  const [typeFilter, setTypeFilter] = React.useState<string | null>(null)
  const [statusFilter, setStatusFilter] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState('')

  // Resend dialog
  const [selectedLog, setSelectedLog] = React.useState<EmailLogEntry | null>(null)
  const [resendTo, setResendTo] = React.useState('')
  const [isResending, setIsResending] = React.useState(false)

  // Filter logs client-side
  const filteredLogs = React.useMemo(() => {
    let logs = initialLogs

    if (typeFilter) {
      logs = logs.filter((log) => log.emailType === typeFilter)
    }

    if (statusFilter) {
      logs = logs.filter((log) => log.status === statusFilter)
    }

    if (search) {
      const searchLower = search.toLowerCase()
      logs = logs.filter(
        (log) =>
          log.recipient.toLowerCase().includes(searchLower) ||
          log.orderNumber?.toLowerCase().includes(searchLower)
      )
    }

    return logs
  }, [initialLogs, typeFilter, statusFilter, search])

  // Handle row click
  const handleRowClick = (log: EmailLogEntry) => {
    setSelectedLog(log)
    setResendTo(log.recipient)
  }

  // Handle resend
  const handleResend = async () => {
    if (!selectedLog || !resendTo) return
    setIsResending(true)

    try {
      // For order-related emails, use the existing resend endpoint
      if (selectedLog.orderId && ['order_confirmation', 'sales_notification'].includes(selectedLog.emailType)) {
        const type = selectedLog.emailType === 'order_confirmation' ? 'customer' : 'sales'
        const response = await fetch(`/api/admin/orders/${selectedLog.orderId}/resend-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type, overrideEmail: resendTo }),
        })

        const data = await response.json()
        if (data.success) {
          router.refresh()
          setSelectedLog(null)
        } else {
          alert(data.error || 'Failed to resend email')
        }
      } else {
        // For other email types, show not supported message
        alert('Resending this email type is not yet supported. Please trigger it from the original location.')
      }
    } catch {
      alert('Failed to resend email')
    } finally {
      setIsResending(false)
    }
  }

  // Table columns
  const columns: DataTableColumn<EmailLogEntry>[] = [
    {
      id: 'status',
      header: 'Status',
      cell: (row) => (
        <div className="flex items-center gap-1.5">
          {row.status === 'sent' ? (
            <>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-800">Sent</span>
            </>
          ) : (
            <>
              <XCircle className="h-4 w-4 text-red-600" />
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-800">Failed</span>
            </>
          )}
        </div>
      ),
      minWidth: 100,
    },
    {
      id: 'type',
      header: 'Type',
      cell: (row) => (
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-muted-foreground" />
          <span>{EMAIL_TYPE_LABELS[row.emailType] || row.emailType}</span>
        </div>
      ),
      minWidth: 180,
    },
    {
      id: 'recipient',
      header: 'Recipient',
      cell: (row) => (
        <span className="text-sm truncate max-w-[200px] block" title={row.recipient}>
          {row.recipient}
        </span>
      ),
      minWidth: 200,
    },
    {
      id: 'order',
      header: 'Order',
      cell: (row) =>
        row.orderNumber ? (
          <a
            href={`/admin/orders/${row.orderId}`}
            className="text-sm text-blue-600 hover:underline flex items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            {row.orderNumber}
            <ExternalLink className="h-3 w-3" />
          </a>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
      minWidth: 120,
    },
    {
      id: 'timestamp',
      header: 'Date/Time',
      cell: (row) => (
        <span className="text-sm text-muted-foreground">
          {formatDateTime(row.timestamp)}
        </span>
      ),
      sortValue: (row) => row.timestamp.getTime(),
      sortable: true,
      minWidth: 150,
    },
    {
      id: 'actions',
      header: '',
      cell: (row) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleRowClick(row)}
        >
          View
        </Button>
      ),
      minWidth: 80,
    },
  ]

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{initialStats.last24Hours}</div>
            <div className="text-sm text-muted-foreground">Last 24 hours</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-green-600">{initialStats.totalSent}</div>
            <div className="text-sm text-muted-foreground">Sent (7 days)</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-red-600">{initialStats.totalFailed}</div>
            <div className="text-sm text-muted-foreground">Failed (7 days)</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">
              {initialStats.totalSent + initialStats.totalFailed > 0
                ? Math.round((initialStats.totalSent / (initialStats.totalSent + initialStats.totalFailed)) * 100)
                : 0}%
            </div>
            <div className="text-sm text-muted-foreground">Success rate</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <FilterPill
          label="Type"
          value={typeFilter}
          options={EMAIL_TYPE_OPTIONS}
          onChange={setTypeFilter}
          allLabel="All Types"
        />
        <FilterPill
          label="Status"
          value={statusFilter}
          options={STATUS_OPTIONS}
          onChange={setStatusFilter}
          allLabel="All Status"
        />
        <SearchInput
          value={search}
          onValueChange={setSearch}
          placeholder="Search order # or email..."
          className="w-64"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.refresh()}
          className="ml-auto"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <DataTable
            data={filteredLogs}
            columns={columns}
            getRowId={(row) => row.id}
            pageSize={25}
            size="sm"
          />
        </CardContent>
      </Card>

      {/* Empty state */}
      {filteredLogs.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No email logs found matching your filters.</p>
        </div>
      )}

      {/* Resend Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Email Details</DialogTitle>
          </DialogHeader>

          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Type:</span>
                  <p className="font-medium">{EMAIL_TYPE_LABELS[selectedLog.emailType]}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Status:</span>
                  <p className="font-medium flex items-center gap-1">
                    {selectedLog.status === 'sent' ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                        Sent
                      </>
                    ) : (
                      <>
                        <XCircle className="h-4 w-4 text-red-600" />
                        Failed
                      </>
                    )}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Recipient:</span>
                  <p className="font-medium">{selectedLog.recipient}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Date:</span>
                  <p className="font-medium">{formatDateTime(selectedLog.timestamp)}</p>
                </div>
                {selectedLog.orderNumber && (
                  <div>
                    <span className="text-muted-foreground">Order:</span>
                    <p className="font-medium">
                      <a
                        href={`/admin/orders/${selectedLog.orderId}`}
                        className="text-blue-600 hover:underline"
                      >
                        {selectedLog.orderNumber}
                      </a>
                    </p>
                  </div>
                )}
              </div>

              {selectedLog.errorMessage && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-sm text-red-800">
                    <strong>Error:</strong> {selectedLog.errorMessage}
                  </p>
                </div>
              )}

              {selectedLog.orderId && ['order_confirmation', 'sales_notification'].includes(selectedLog.emailType) && (
                <div className="border-t pt-4 mt-4">
                  <label className="text-sm font-medium block mb-2">Resend To</label>
                  <Input
                    type="email"
                    value={resendTo}
                    onChange={(e) => setResendTo(e.target.value)}
                    placeholder="recipient@example.com"
                  />
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedLog(null)}>
              Close
            </Button>
            {selectedLog?.orderId && ['order_confirmation', 'sales_notification'].includes(selectedLog.emailType) && (
              <Button onClick={handleResend} disabled={isResending || !resendTo}>
                {isResending ? 'Resending...' : 'Resend Email'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
