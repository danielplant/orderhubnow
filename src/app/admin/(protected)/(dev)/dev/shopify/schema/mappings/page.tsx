'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2, AlertCircle, RefreshCw, Database, ArrowLeft, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MappingsTable } from '@/components/admin/schema-graph/MappingsTable'
import { ServiceSelector } from '@/components/admin/schema-graph/ServiceSelector'
import { ValidationPanel } from '@/components/admin/schema-graph/ValidationPanel'

// ============================================================================
// Types
// ============================================================================

interface FieldMapping {
  id: number
  connectionId: string
  entityType: string
  fieldPath: string
  fullPath: string
  depth: number
  targetTable: string | null
  targetColumn: string | null
  transformType: string
  transformConfig: Record<string, unknown> | null
  enabled: boolean
  isProtected: boolean
  accessStatus: string
  serviceName: string | null
  fieldType: string
  sortOrder: number | null
  createdAt: string
  updatedAt: string
}

type LoadState = 'loading' | 'success' | 'empty' | 'error'

// ============================================================================
// Inner Component (uses useSearchParams)
// ============================================================================

function MappingsPageInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const selectedService = searchParams.get('service')

  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [mappings, setMappings] = useState<FieldMapping[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isSeeding, setIsSeeding] = useState(false)
  const [seedResult, setSeedResult] = useState<{ created: number; skipped: number; updated?: number } | null>(null)

  // Phase 3: Introspection state
  const [isIntrospecting, setIsIntrospecting] = useState(false)
  const [introspectResult, setIntrospectResult] = useState<{
    success: boolean
    message?: string
    error?: string
    stats?: { discovered: number; created: number; updated: number; markedRemoved: number; introspectedAt: string }
  } | null>(null)

  // Handle service selection change
  const handleServiceChange = (service: string | null) => {
    const params = new URLSearchParams(searchParams.toString())
    if (service) {
      params.set('service', service)
    } else {
      params.delete('service')
    }
    router.push(`?${params.toString()}`)
  }

  // Fetch mappings with optional service filter
  const fetchMappings = useCallback(async () => {
    setLoadState('loading')
    setError(null)

    try {
      const url = selectedService
        ? `/api/admin/shopify/schema/mappings?service=${selectedService}`
        : '/api/admin/shopify/schema/mappings'
      const res = await fetch(url)
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error?.message || `HTTP ${res.status}`)
      }

      if (data.mappings.length === 0) {
        setLoadState('empty')
      } else {
        setMappings(data.mappings)
        setLoadState('success')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load mappings')
      setLoadState('error')
    }
  }, [selectedService])

  // Seed mappings
  const handleSeed = useCallback(async () => {
    setIsSeeding(true)
    setSeedResult(null)

    try {
      const res = await fetch('/api/admin/shopify/schema/seed', { method: 'POST' })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to seed mappings')
      }

      setSeedResult({ created: data.created, skipped: data.skipped, updated: data.updated })
      // Refresh the table
      await fetchMappings()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to seed mappings')
    } finally {
      setIsSeeding(false)
    }
  }, [fetchMappings])

  // Phase 3: Toggle enabled state for metafields
  const handleToggleEnabled = useCallback(async (id: number, currentEnabled: boolean, fieldType: string) => {
    // Only allow toggling metafields
    if (fieldType !== 'metafield') {
      return
    }
    
    try {
      const res = await fetch(`/api/admin/shopify/schema/mappings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !currentEnabled }),
      })
      
      if (!res.ok) {
        const data = await res.json()
        alert(`Update failed: ${data.error}`)
        return
      }
      
      // Refresh mappings
      await fetchMappings()
    } catch (err) {
      alert('Failed to update mapping')
    }
  }, [fetchMappings])

  // Phase 3: Introspect Shopify schema
  const handleIntrospect = useCallback(async () => {
    setIsIntrospecting(true)
    setIntrospectResult(null)
    
    try {
      const res = await fetch('/api/admin/shopify/schema/introspect', {
        method: 'POST',
      })
      const data = await res.json()
      setIntrospectResult(data)
      
      if (data.success) {
        fetchMappings() // Refresh to show new/updated fields
      }
    } catch (err) {
      setIntrospectResult({
        success: false,
        message: 'Network error during introspection',
      })
    } finally {
      setIsIntrospecting(false)
    }
  }, [fetchMappings])

  // Load on mount and when service changes
  useEffect(() => {
    fetchMappings()
  }, [fetchMappings])

  return (
    <main className="p-6 md:p-10 bg-muted/30 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Link
                href="/admin/dev/shopify/schema"
                className="text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <h2 className="text-4xl font-bold">Field Mappings</h2>
            </div>
            <p className="text-muted-foreground">
              View and manage Shopify field to database column mappings
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="default" onClick={handleIntrospect} disabled={isIntrospecting} className="bg-purple-600 hover:bg-purple-700">
              {isIntrospecting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Search className="w-4 h-4 mr-2" />
              )}
              {isIntrospecting ? 'Introspecting...' : 'Introspect Shopify'}
            </Button>
            <Button variant="outline" onClick={handleSeed} disabled={isSeeding}>
              {isSeeding ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Database className="w-4 h-4 mr-2" />
              )}
              {isSeeding ? 'Seeding...' : 'Seed Baseline'}
            </Button>
            <Button variant="outline" onClick={fetchMappings}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>
        
        {/* Introspection result notification */}
        {introspectResult && (
          <div className={`mb-4 p-3 rounded-lg text-sm ${
            introspectResult.success 
              ? 'bg-purple-50 border border-purple-200 text-purple-800' 
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}>
            {introspectResult.success ? (
              <>
                <span className="font-medium">Introspection complete: </span>
                {introspectResult.stats?.discovered} metafields found. 
                Created: {introspectResult.stats?.created}, 
                Updated: {introspectResult.stats?.updated}
                {introspectResult.stats?.markedRemoved ? `, Removed: ${introspectResult.stats.markedRemoved}` : ''}
              </>
            ) : (
              <span>{introspectResult.error || introspectResult.message}</span>
            )}
          </div>
        )}

        {/* Service Filter and Stats */}
        <div className="flex items-center gap-4 mb-6">
          <ServiceSelector value={selectedService} onChange={handleServiceChange} />
          <span className="text-muted-foreground text-sm">
            {mappings.length} mapping{mappings.length !== 1 ? 's' : ''}
            {selectedService && ` in ${selectedService}`}
          </span>
        </div>

        {/* Validation Panel */}
        <div className="mb-6">
          <ValidationPanel serviceName={selectedService} />
        </div>

        {/* Seed result notification */}
        {seedResult && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
            Seeded {seedResult.created} new mappings
            {seedResult.updated ? `, updated ${seedResult.updated}` : ''}
            {seedResult.skipped ? `, skipped ${seedResult.skipped} unchanged` : ''}.
          </div>
        )}

        {/* Loading State */}
        {loadState === 'loading' && (
          <div className="flex items-center justify-center h-64 border rounded-lg bg-white">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Loading mappings...</span>
          </div>
        )}

        {/* Empty State */}
        {loadState === 'empty' && (
          <div className="flex flex-col items-center justify-center h-64 text-center border rounded-lg bg-white">
            <Database className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Mappings Found</h3>
            <p className="text-muted-foreground mb-4 max-w-md">
              {selectedService
                ? `No mappings found for service "${selectedService}". Try selecting "All Services" or run the seed.`
                : 'Click "Seed Baseline" to populate with fields from the current sync configuration.'}
            </p>
            {!selectedService && (
              <Button onClick={handleSeed} disabled={isSeeding}>
                {isSeeding ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Database className="w-4 h-4 mr-2" />
                )}
                Seed Baseline
              </Button>
            )}
          </div>
        )}

        {/* Error State */}
        {loadState === 'error' && (
          <div className="flex flex-col items-center justify-center h-64 text-center border rounded-lg bg-white">
            <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
            <h3 className="text-lg font-semibold mb-2">Failed to Load Mappings</h3>
            <p className="text-muted-foreground mb-4">{error}</p>
            <Button onClick={fetchMappings}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        )}

        {/* Success State */}
        {loadState === 'success' && (
          <div className="border rounded-lg bg-white p-6">
            <MappingsTable mappings={mappings} onRefresh={fetchMappings} onToggleEnabled={handleToggleEnabled} />
          </div>
        )}
      </div>
    </main>
  )
}

// ============================================================================
// Main Component (with Suspense for useSearchParams)
// ============================================================================

export default function MappingsPage() {
  return (
    <Suspense
      fallback={
        <main className="p-6 md:p-10 bg-muted/30 min-h-screen">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-center h-64 border rounded-lg bg-white">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Loading...</span>
            </div>
          </div>
        </main>
      }
    >
      <MappingsPageInner />
    </Suspense>
  )
}
