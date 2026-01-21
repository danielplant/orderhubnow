'use client'

/**
 * Sample Data Viewer
 *
 * Displays sample data fetched from Shopify using enabled fields.
 * Allows navigating through multiple samples with configurable count.
 */

import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight, RefreshCw, Loader2 } from 'lucide-react'
import { formatDateTime } from '@/lib/utils/format'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ============================================================================
// Types
// ============================================================================

export interface SampleDataViewerProps {
  entityType: string
  refreshTrigger?: number // Increment to trigger refresh
}

// ============================================================================
// Main Component
// ============================================================================

export function SampleDataViewer({ entityType, refreshTrigger = 0 }: SampleDataViewerProps) {
  const [samples, setSamples] = useState<unknown[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [sampleCount, setSampleCount] = useState(3)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fetchedAt, setFetchedAt] = useState<string | null>(null)
  const [enabledFieldCount, setEnabledFieldCount] = useState(0)

  const fetchSamples = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/admin/shopify/sample-data/${entityType}?count=${sampleCount}`)
      const data = await res.json()

      if (!data.success) {
        setError(data.error || 'Failed to load sample data')
        return
      }

      setSamples(data.samples || [])
      setFetchedAt(data.fetchedAt)
      setEnabledFieldCount(data.enabledFieldCount || 0)
      setCurrentIndex(0)

      if (data.message) {
        setError(data.message)
      }
    } catch (err) {
      setError('Failed to fetch sample data')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [entityType, sampleCount])

  useEffect(() => {
    fetchSamples()
  }, [fetchSamples, refreshTrigger])

  const handlePrev = () => {
    setCurrentIndex((prev) => Math.max(0, prev - 1))
  }

  const handleNext = () => {
    setCurrentIndex((prev) => Math.min(samples.length - 1, prev + 1))
  }

  const handleCountChange = (count: number) => {
    setSampleCount(count)
  }

  // Format JSON with syntax highlighting
  const formatJson = (obj: unknown): string => {
    return JSON.stringify(obj, null, 2)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Sample Data Preview</CardTitle>
            <CardDescription>
              Preview {entityType} data using currently enabled fields.
              {enabledFieldCount > 0 && (
                <span className="ml-1">
                  Fetching {enabledFieldCount} field{enabledFieldCount !== 1 ? 's' : ''}.
                </span>
              )}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={fetchSamples} disabled={loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span className="ml-1.5">Refresh</span>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Sample Count Selector */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Samples:</span>
          {[1, 3, 5].map((count) => (
            <button
              key={count}
              onClick={() => handleCountChange(count)}
              className={cn(
                'px-3 py-1 text-sm rounded-md transition-colors',
                sampleCount === count
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted hover:bg-muted/80 text-muted-foreground'
              )}
            >
              {count}
            </button>
          ))}
        </div>

        {/* Data Display */}
        {loading && samples.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading sample data...
          </div>
        ) : error && samples.length === 0 ? (
          <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-sm break-words overflow-hidden">
            {error}
          </div>
        ) : samples.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No sample data available.</p>
            <p className="text-sm mt-2">Enable some fields and refresh to see sample data.</p>
          </div>
        ) : (
          <>
            {/* JSON Viewer */}
            <div className="relative">
              <pre className="p-4 rounded-lg bg-muted/50 border border-border overflow-auto max-h-96 text-xs font-mono">
                <code>{formatJson(samples[currentIndex])}</code>
              </pre>
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <div className="text-xs text-muted-foreground">
                {fetchedAt && (
                  <span>
                    Fetched at {formatDateTime(fetchedAt)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrev}
                  disabled={currentIndex === 0}
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span className="sr-only">Previous</span>
                </Button>
                <span className="text-sm text-muted-foreground min-w-[4rem] text-center">
                  {currentIndex + 1} / {samples.length}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNext}
                  disabled={currentIndex >= samples.length - 1}
                >
                  <ChevronRight className="h-4 w-4" />
                  <span className="sr-only">Next</span>
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
