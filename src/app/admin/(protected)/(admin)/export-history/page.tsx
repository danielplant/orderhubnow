import { Suspense } from 'react'
import Link from 'next/link'
import {
  FileSpreadsheet,
  FileText,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  Download,
  AlertCircle,
} from 'lucide-react'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// ============================================================================
// Types
// ============================================================================

interface ExportJob {
  id: string
  type: 'xlsx' | 'pdf'
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'expired'
  triggeredByRole: string
  progressPercent: number | null
  currentStep: string | null
  createdAt: string
  completedAt: string | null
  durationMs: number | null
  totalSkus: number | null
  outputFilename: string | null
  outputSizeBytes: number | null
  errorMessage: string | null
  expiresAt: string | null
}

interface PageProps {
  searchParams: Promise<{ status?: string }>
}

// ============================================================================
// Data Fetching
// ============================================================================

async function getExportHistory(statusFilter?: string): Promise<ExportJob[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {}
    if (statusFilter && statusFilter !== 'all') {
      where.status = statusFilter
    }

    const jobs = await prisma.exportJob.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        type: true,
        status: true,
        triggeredByRole: true,
        progressPercent: true,
        currentStep: true,
        createdAt: true,
        completedAt: true,
        durationMs: true,
        totalSkus: true,
        outputFilename: true,
        outputSizeBytes: true,
        errorMessage: true,
        expiresAt: true,
      },
    })

    return jobs.map((job) => ({
      id: job.id,
      type: job.type as 'xlsx' | 'pdf',
      status: job.status as ExportJob['status'],
      triggeredByRole: job.triggeredByRole,
      progressPercent: job.progressPercent,
      currentStep: job.currentStep,
      createdAt: job.createdAt.toISOString(),
      completedAt: job.completedAt?.toISOString() ?? null,
      durationMs: job.durationMs,
      totalSkus: job.totalSkus,
      outputFilename: job.outputFilename,
      outputSizeBytes: job.outputSizeBytes,
      errorMessage: job.errorMessage,
      expiresAt: job.expiresAt?.toISOString() ?? null,
    }))
  } catch (error) {
    console.error('Failed to fetch export history:', error)
    return []
  }
}

// ============================================================================
// Components
// ============================================================================

function StatusBadge({ status }: { status: ExportJob['status'] }) {
  const config = {
    pending: { icon: Clock, color: 'bg-slate-100 text-slate-700', label: 'Pending' },
    processing: {
      icon: RefreshCw,
      color: 'bg-amber-100 text-amber-700',
      label: 'Processing',
    },
    completed: { icon: CheckCircle, color: 'bg-green-100 text-green-700', label: 'Completed' },
    failed: { icon: XCircle, color: 'bg-red-100 text-red-700', label: 'Failed' },
    cancelled: { icon: XCircle, color: 'bg-slate-100 text-slate-500', label: 'Cancelled' },
    expired: { icon: AlertCircle, color: 'bg-orange-100 text-orange-700', label: 'Expired' },
  }

  const { icon: Icon, color, label } = config[status] ?? config.failed

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${color}`}>
      <Icon className={`h-3 w-3 ${status === 'processing' ? 'animate-spin' : ''}`} />
      {label}
    </span>
  )
}

function TypeIcon({ type }: { type: 'xlsx' | 'pdf' }) {
  return type === 'xlsx' ? (
    <FileSpreadsheet className="h-4 w-4 text-green-600" />
  ) : (
    <FileText className="h-4 w-4 text-red-600" />
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDuration(ms: number | null): string {
  if (!ms) return '-'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function isExpired(job: ExportJob): boolean {
  if (job.status === 'expired') return true
  if (!job.expiresAt) return false
  return new Date() > new Date(job.expiresAt)
}

function ExportRow({ job }: { job: ExportJob }) {
  const expired = isExpired(job)
  const canDownload = job.status === 'completed' && !expired

  return (
    <tr className="hover:bg-muted/30">
      <td className="px-4 py-3 text-sm">{formatDate(job.createdAt)}</td>
      <td className="px-4 py-3 text-sm">
        <div className="flex items-center gap-2">
          <TypeIcon type={job.type} />
          <span className="uppercase font-medium">{job.type}</span>
        </div>
      </td>
      <td className="px-4 py-3 text-sm">
        <StatusBadge status={expired && job.status === 'completed' ? 'expired' : job.status} />
      </td>
      <td className="px-4 py-3 text-sm text-right">{job.totalSkus?.toLocaleString() ?? '-'}</td>
      <td className="px-4 py-3 text-sm text-right">
        {job.outputSizeBytes ? formatBytes(job.outputSizeBytes) : '-'}
      </td>
      <td className="px-4 py-3 text-sm text-right">{formatDuration(job.durationMs)}</td>
      <td className="px-4 py-3 text-sm">
        {canDownload ? (
          <a
            href={`/api/admin/exports/${job.id}/download`}
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            <Download className="h-3 w-3" />
            Download
          </a>
        ) : job.status === 'failed' && job.errorMessage ? (
          <span
            className="text-red-600 truncate max-w-[120px] inline-block cursor-help"
            title={job.errorMessage}
          >
            {job.errorMessage.slice(0, 30)}...
          </span>
        ) : job.status === 'processing' ? (
          <span className="text-muted-foreground">
            {job.progressPercent ?? 0}%
          </span>
        ) : expired ? (
          <span className="text-muted-foreground">Expired</span>
        ) : (
          '-'
        )}
      </td>
    </tr>
  )
}

function StatusTabs({ current }: { current: string }) {
  const tabs = [
    { value: 'all', label: 'All' },
    { value: 'completed', label: 'Completed' },
    { value: 'processing', label: 'Processing' },
    { value: 'failed', label: 'Failed' },
  ]

  return (
    <div className="flex gap-1 border-b border-border mb-4">
      {tabs.map((tab) => (
        <Link
          key={tab.value}
          href={tab.value === 'all' ? '/admin/export-history' : `/admin/export-history?status=${tab.value}`}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            current === tab.value
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  )
}

// ============================================================================
// Main Components
// ============================================================================

async function ExportHistoryTable({ statusFilter }: { statusFilter: string }) {
  const jobs = await getExportHistory(statusFilter === 'all' ? undefined : statusFilter)

  if (jobs.length === 0) {
    return (
      <div className="text-center py-12 border rounded-lg">
        <FileSpreadsheet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <p className="text-lg font-medium mb-2">No exports found</p>
        <p className="text-muted-foreground">
          {statusFilter !== 'all'
            ? `No ${statusFilter} exports. Try a different filter.`
            : 'Export products to see history here'}
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <table className="w-full">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-4 py-3 text-left text-sm font-medium">Created</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Type</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Status</th>
            <th className="px-4 py-3 text-right text-sm font-medium">SKUs</th>
            <th className="px-4 py-3 text-right text-sm font-medium">Size</th>
            <th className="px-4 py-3 text-right text-sm font-medium">Duration</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {jobs.map((job) => (
            <ExportRow key={job.id} job={job} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default async function ExportHistoryPage({ searchParams }: PageProps) {
  const params = await searchParams
  const statusFilter = params.status || 'all'

  return (
    <main className="p-6 max-w-[1200px] mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Export History</h1>
        <p className="text-muted-foreground mt-1">
          View past product exports and download completed files
        </p>
      </div>

      <StatusTabs current={statusFilter} />

      <Suspense
        fallback={
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            Loading history...
          </div>
        }
      >
        <ExportHistoryTable statusFilter={statusFilter} />
      </Suspense>
    </main>
  )
}
