/**
 * Email Logs Queries
 *
 * Fetch email send history from ActivityLogs table.
 */

import { prisma } from '@/lib/prisma'
import type { EmailType } from '@/lib/audit/activity-logger'

// ============================================================================
// Types
// ============================================================================

export interface EmailLogEntry {
  id: string
  emailType: EmailType
  recipient: string
  orderNumber: string | null
  orderId: string | null
  status: 'sent' | 'failed'
  errorMessage: string | null
  timestamp: Date
  performedBy: string | null
}

export interface EmailLogFilters {
  emailType?: EmailType
  status?: 'sent' | 'failed'
  dateFrom?: Date
  dateTo?: Date
  search?: string // Order number or recipient email
}

export interface EmailLogStats {
  totalSent: number
  totalFailed: number
  last24Hours: number
  byType: Record<string, { sent: number; failed: number }>
}

// ============================================================================
// Queries
// ============================================================================

/**
 * Fetch email logs with optional filtering.
 */
export async function getEmailLogs(
  filters?: EmailLogFilters,
  limit: number = 100,
  offset: number = 0
): Promise<{ logs: EmailLogEntry[]; total: number }> {
  // Build where clause
  const where: Record<string, unknown> = {
    Action: 'email_sent',
  }

  if (filters?.dateFrom || filters?.dateTo) {
    where.DateAdded = {}
    if (filters.dateFrom) (where.DateAdded as Record<string, Date>).gte = filters.dateFrom
    if (filters.dateTo) (where.DateAdded as Record<string, Date>).lte = filters.dateTo
  }

  if (filters?.search) {
    where.OR = [
      { OrderNumber: { contains: filters.search } },
      { NewValues: { contains: filters.search } }, // recipient is stored in NewValues JSON
    ]
  }

  // Fetch logs
  const [logs, total] = await Promise.all([
    prisma.activityLogs.findMany({
      where,
      orderBy: { DateAdded: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.activityLogs.count({ where }),
  ])

  // Parse and filter by emailType/status if needed
  let parsed = logs.map((log) => {
    let emailType: EmailType = 'order_confirmation'
    let recipient = ''
    let status: 'sent' | 'failed' = 'sent'
    let errorMessage: string | null = null

    if (log.NewValues) {
      try {
        const values = JSON.parse(log.NewValues)
        emailType = values.emailType || 'order_confirmation'
        recipient = values.recipient || ''
        status = values.status || 'sent'
        errorMessage = values.errorMessage || null
      } catch {
        // Ignore parse errors
      }
    }

    return {
      id: log.ID.toString(),
      emailType,
      recipient,
      orderNumber: log.OrderNumber,
      orderId: log.OrderId?.toString() || null,
      status,
      errorMessage,
      timestamp: log.DateAdded,
      performedBy: log.PerformedBy,
    }
  })

  // Apply post-filters (emailType and status are in JSON, can't filter in DB easily)
  if (filters?.emailType) {
    parsed = parsed.filter((log) => log.emailType === filters.emailType)
  }
  if (filters?.status) {
    parsed = parsed.filter((log) => log.status === filters.status)
  }

  return { logs: parsed, total }
}

/**
 * Get email statistics.
 */
export async function getEmailLogStats(dateFrom?: Date): Promise<EmailLogStats> {
  const where: Record<string, unknown> = {
    Action: 'email_sent',
  }

  if (dateFrom) {
    where.DateAdded = { gte: dateFrom }
  }

  const logs = await prisma.activityLogs.findMany({
    where,
    select: {
      NewValues: true,
      DateAdded: true,
    },
  })

  const now = new Date()
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  let totalSent = 0
  let totalFailed = 0
  let last24Hours = 0
  const byType: Record<string, { sent: number; failed: number }> = {}

  for (const log of logs) {
    let emailType = 'unknown'
    let status: 'sent' | 'failed' = 'sent'

    if (log.NewValues) {
      try {
        const values = JSON.parse(log.NewValues)
        emailType = values.emailType || 'unknown'
        status = values.status || 'sent'
      } catch {
        // Ignore
      }
    }

    if (status === 'sent') {
      totalSent++
    } else {
      totalFailed++
    }

    if (log.DateAdded >= oneDayAgo) {
      last24Hours++
    }

    if (!byType[emailType]) {
      byType[emailType] = { sent: 0, failed: 0 }
    }
    byType[emailType][status]++
  }

  return {
    totalSent,
    totalFailed,
    last24Hours,
    byType,
  }
}

/**
 * Get recent email activity for a specific order.
 */
export async function getOrderEmailHistory(orderId: string): Promise<EmailLogEntry[]> {
  const logs = await prisma.activityLogs.findMany({
    where: {
      OrderId: BigInt(orderId),
      Action: 'email_sent',
    },
    orderBy: { DateAdded: 'desc' },
    take: 50,
  })

  return logs.map((log) => {
    let emailType: EmailType = 'order_confirmation'
    let recipient = ''
    let status: 'sent' | 'failed' = 'sent'
    let errorMessage: string | null = null

    if (log.NewValues) {
      try {
        const values = JSON.parse(log.NewValues)
        emailType = values.emailType || 'order_confirmation'
        recipient = values.recipient || ''
        status = values.status || 'sent'
        errorMessage = values.errorMessage || null
      } catch {
        // Ignore
      }
    }

    return {
      id: log.ID.toString(),
      emailType,
      recipient,
      orderNumber: log.OrderNumber,
      orderId: log.OrderId?.toString() || null,
      status,
      errorMessage,
      timestamp: log.DateAdded,
      performedBy: log.PerformedBy,
    }
  })
}
