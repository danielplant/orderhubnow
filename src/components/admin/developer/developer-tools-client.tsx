'use client'

/**
 * Developer Tools Client Component
 *
 * Interactive UI for configuring Shopify sync:
 * - Entity selector (Product, ProductVariant, etc.)
 * - Status filter configuration with checkboxes
 * - Field configuration with toggles
 * - Access probe testing
 * - Metafield discovery
 * - Sample data preview
 */

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { RefreshCw, Loader2 } from 'lucide-react'
import { formatDate } from '@/lib/utils/format'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FieldConfigPanel, FieldConfig, FieldCategory } from './field-config-panel'
import { MetafieldsPanel, EnabledMetafield } from './metafields-panel'
import { SampleDataViewer } from './sample-data-viewer'
import { AccessStatus } from './field-toggle-row'

// ============================================================================
// Types
// ============================================================================

interface FilterDistribution {
  entityType: string
  total: number
  distribution: Record<string, number>
  activeFilters: Array<{
    fieldPath: string
    operator: string
    value: string
  }>
}

interface Entity {
  name: string
  displayName: string
  hasMetafields: boolean
}

interface SyncConfigResponse {
  success: boolean
  entityType: string
  fields: FieldConfig[]
  filters: Array<{
    fieldPath: string
    operator: string
    value: string
    enabled: boolean
  }>
  runtimeFlags: Array<{
    configKey: string
    enabled: boolean
  }>
  protectedFields: string[]
  schemaInfo?: {
    apiVersion: string
    fetchedAt: string
  }
  error?: string
}

// ============================================================================
// Status Filter Panel
// ============================================================================

function StatusFilterPanel({
  distribution,
  selectedStatuses,
  onStatusChange,
  hasChanges,
}: {
  distribution: FilterDistribution | null
  selectedStatuses: string[]
  onStatusChange: (status: string, checked: boolean) => void
  hasChanges: boolean
}) {
  const STATUSES = ['ACTIVE', 'DRAFT', 'ARCHIVED']

  if (!distribution) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Product Status Filter</CardTitle>
          <CardDescription>Loading distribution...</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const total = distribution.total
  const selectedCount = STATUSES.filter((s) => selectedStatuses.includes(s)).reduce(
    (sum, s) => sum + (distribution.distribution[s] || 0),
    0
  )
  const excludedCount = total - selectedCount

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Product Status Filter
          {hasChanges && (
            <span className="text-xs font-medium px-2 py-1 rounded-full border border-amber-600 text-amber-600">
              Unsaved
            </span>
          )}
        </CardTitle>
        <CardDescription>
          Select which product statuses to include in the sync. Only products matching these statuses
          will be added to the Sku table.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Status Distribution */}
        <div className="mb-6">
          <div className="text-sm font-medium mb-3">Current Distribution</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {STATUSES.map((status) => {
              const count = distribution.distribution[status] || 0
              const percentage = total > 0 ? ((count / total) * 100).toFixed(1) : '0'
              const isSelected = selectedStatuses.includes(status)

              return (
                <div
                  key={status}
                  className={`p-4 rounded-lg border ${
                    isSelected
                      ? 'border-primary bg-primary/5'
                      : 'border-border bg-muted/30 opacity-60'
                  }`}
                >
                  <div className="text-2xl font-bold">{count.toLocaleString()}</div>
                  <div className="text-sm text-muted-foreground">
                    {status} ({percentage}%)
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Status Checkboxes */}
        <div className="space-y-3">
          <div className="text-sm font-medium">Include in Sync</div>
          {STATUSES.map((status) => {
            const count = distribution.distribution[status] || 0
            const isSelected = selectedStatuses.includes(status)

            return (
              <label
                key={status}
                className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={(e) => onStatusChange(status, e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <div className="flex-1">
                  <span className="font-medium">{status}</span>
                  <span className="text-muted-foreground ml-2">({count.toLocaleString()} products)</span>
                </div>
                {status === 'ACTIVE' && (
                  <span className="text-xs font-medium px-2 py-0.5 rounded bg-muted text-muted-foreground">
                    Recommended
                  </span>
                )}
              </label>
            )
          })}
        </div>

        {/* Impact Preview */}
        <div className="mt-6 p-4 rounded-lg bg-muted/50 border border-border">
          <div className="text-sm font-medium mb-2">Impact Preview</div>
          <div className="flex items-center gap-4 text-sm">
            <div>
              <span className="text-green-600 font-medium">{selectedCount.toLocaleString()}</span>{' '}
              products will be included
            </div>
            <div className="text-muted-foreground">|</div>
            <div>
              <span className="text-red-600 font-medium">{excludedCount.toLocaleString()}</span>{' '}
              products will be excluded
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================================
// Entity Selector
// ============================================================================

function EntitySelector({
  entities,
  selectedEntity,
  onSelect,
}: {
  entities: Entity[]
  selectedEntity: string
  onSelect: (entity: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-2 mb-6">
      {entities.map((entity) => (
        <button
          key={entity.name}
          onClick={() => onSelect(entity.name)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            selectedEntity === entity.name
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted hover:bg-muted/80 text-muted-foreground'
          }`}
        >
          {entity.displayName}
        </button>
      ))}
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function DeveloperToolsClient() {
  // Entity state
  const [entities, setEntities] = useState<Entity[]>([])
  const [selectedEntity, setSelectedEntity] = useState('Product')

  // Status filter state
  const [distribution, setDistribution] = useState<FilterDistribution | null>(null)
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(['ACTIVE'])
  const [originalStatuses, setOriginalStatuses] = useState<string[]>(['ACTIVE'])

  // Runtime flags state
  const [runtimeFlags, setRuntimeFlags] = useState({
    ingestionActiveOnly: false,
    transferActiveOnly: false,
  })
  const [originalRuntimeFlags, setOriginalRuntimeFlags] = useState({
    ingestionActiveOnly: false,
    transferActiveOnly: false,
  })

  // Field configuration state
  const [fieldConfig, setFieldConfig] = useState<FieldConfig[]>([])
  const [originalFieldConfig, setOriginalFieldConfig] = useState<FieldConfig[]>([])
  const [schemaInfo, setSchemaInfo] = useState<{ apiVersion: string; fetchedAt: string } | null>(null)

  // Metafield state
  const [enabledMetafields, setEnabledMetafields] = useState<EnabledMetafield[]>([])
  const [originalMetafields, setOriginalMetafields] = useState<EnabledMetafield[]>([])

  // Probe state
  const [isProbing, setIsProbing] = useState(false)
  const [probeProgress, setProbeProgress] = useState<{ current: number; total: number } | null>(null)

  // UI state
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [refreshingSchema, setRefreshingSchema] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [sampleRefreshTrigger, setSampleRefreshTrigger] = useState(0)

  // Calculate if there are unsaved changes
  const hasStatusChanges =
    JSON.stringify(selectedStatuses.sort()) !== JSON.stringify(originalStatuses.sort())

  const hasFieldChanges =
    JSON.stringify(fieldConfig.map((f) => ({ path: f.fieldPath, enabled: f.enabled })).sort()) !==
    JSON.stringify(
      originalFieldConfig.map((f) => ({ path: f.fieldPath, enabled: f.enabled })).sort()
    )

  const hasMetafieldChanges =
    JSON.stringify(enabledMetafields.sort()) !== JSON.stringify(originalMetafields.sort())

  const hasRuntimeChanges =
    runtimeFlags.ingestionActiveOnly !== originalRuntimeFlags.ingestionActiveOnly ||
    runtimeFlags.transferActiveOnly !== originalRuntimeFlags.transferActiveOnly

  const hasUnsavedChanges =
    hasStatusChanges || hasFieldChanges || hasMetafieldChanges || hasRuntimeChanges

  // Fetch entities
  useEffect(() => {
    async function fetchEntities() {
      try {
        const res = await fetch('/api/admin/shopify/entities')
        const data = await res.json()
        if (data.success) {
          setEntities(data.entities)
        }
      } catch (err) {
        console.error('Failed to fetch entities:', err)
      }
    }
    fetchEntities()
  }, [])

  // Fetch all configuration when entity changes
  const fetchData = useCallback(
    async (refresh = false) => {
      setLoading(true)
      setError(null)

      try {
        const [distRes, configRes] = await Promise.all([
          fetch(`/api/admin/shopify/filter-preview/${selectedEntity}`),
          fetch(`/api/admin/shopify/sync-config/${selectedEntity}${refresh ? '?refresh=true' : ''}`),
        ])

        const distData = await distRes.json()
        const configData: SyncConfigResponse = await configRes.json()

        if (distData.success) {
          setDistribution(distData)
        }

        if (configData.success) {
          // Parse status filter
          const statusFilter = configData.filters.find((f) => f.fieldPath === 'status')
          if (statusFilter) {
            try {
              const parsed = JSON.parse(statusFilter.value)
              const statuses = Array.isArray(parsed) ? parsed : [parsed]
              setSelectedStatuses(statuses)
              setOriginalStatuses(statuses)
            } catch {
              setSelectedStatuses([statusFilter.value])
              setOriginalStatuses([statusFilter.value])
            }
          } else {
            setSelectedStatuses(['ACTIVE', 'DRAFT', 'ARCHIVED'])
            setOriginalStatuses(['ACTIVE', 'DRAFT', 'ARCHIVED'])
          }

          const runtimeConfig = {
            ingestionActiveOnly: false,
            transferActiveOnly: false,
          }
          for (const flag of configData.runtimeFlags || []) {
            if (flag.configKey === 'ingestionActiveOnly') {
              runtimeConfig.ingestionActiveOnly = flag.enabled
            }
            if (flag.configKey === 'transferActiveOnly') {
              runtimeConfig.transferActiveOnly = flag.enabled
            }
          }
          setRuntimeFlags(runtimeConfig)
          setOriginalRuntimeFlags(runtimeConfig)

          // Set field configuration
          const fields = configData.fields.map((f) => ({
            ...f,
            category: (f.category || 'scalar') as FieldCategory,
            accessStatus: (f.accessStatus || 'untested') as AccessStatus,
          }))
          setFieldConfig(fields)
          setOriginalFieldConfig(JSON.parse(JSON.stringify(fields)))

          // Extract enabled metafields
          const metafields = fields
            .filter((f) => f.isMetafield && f.enabled)
            .map((f) => {
              const [, namespace, key] = f.fieldPath.split('.')
              return { namespace, key, enabled: true }
            })
          setEnabledMetafields(metafields)
          setOriginalMetafields(JSON.parse(JSON.stringify(metafields)))

          // Set schema info
          if (configData.schemaInfo) {
            setSchemaInfo(configData.schemaInfo)
          }
        } else {
          setError(configData.error || 'Failed to load configuration')
        }
      } catch (err) {
        setError('Failed to load configuration')
        console.error(err)
      } finally {
        setLoading(false)
      }
    },
    [selectedEntity]
  )

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Handle status checkbox change
  const handleStatusChange = (status: string, checked: boolean) => {
    setSelectedStatuses((prev) => {
      if (checked) {
        return [...prev, status]
      } else {
        if (prev.length === 1) return prev
        return prev.filter((s) => s !== status)
      }
    })
  }

  const handleRuntimeFlagChange = (
    key: 'ingestionActiveOnly' | 'transferActiveOnly',
    enabled: boolean
  ) => {
    setRuntimeFlags((prev) => ({ ...prev, [key]: enabled }))
  }

  // Handle field toggle change
  const handleFieldChange = (fieldPath: string, enabled: boolean) => {
    setFieldConfig((prev) =>
      prev.map((f) => (f.fieldPath === fieldPath ? { ...f, enabled } : f))
    )
  }

  // Handle bulk actions
  const handleBulkAction = async (action: 'enable-scalars' | 'disable-non-protected' | 'reset') => {
    try {
      const res = await fetch(`/api/admin/shopify/sync-config/${selectedEntity}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bulkAction: action }),
      })

      const data = await res.json()

      if (data.success) {
        setSuccessMessage(data.message)
        setTimeout(() => setSuccessMessage(null), 5000)
        // Refresh to get updated state
        await fetchData()
      } else {
        setError(data.error || 'Failed to apply bulk action')
      }
    } catch (err) {
      setError('Failed to apply bulk action')
      console.error(err)
    }
  }

  // Handle probe fields
  const handleProbeFields = async () => {
    setIsProbing(true)
    setProbeProgress({ current: 0, total: fieldConfig.length })

    try {
      const res = await fetch(`/api/admin/shopify/probe/${selectedEntity}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchSize: 10 }),
      })

      const data = await res.json()

      if (data.success) {
        // Update field config with probe results
        setFieldConfig((prev) =>
          prev.map((f) => {
            const result = data.results.find(
              (r: { fieldPath: string }) => r.fieldPath === f.fieldPath
            )
            if (result) {
              return { ...f, accessStatus: result.accessStatus as AccessStatus }
            }
            return f
          })
        )
        setSuccessMessage(data.message)
        setTimeout(() => setSuccessMessage(null), 5000)
      } else {
        setError(data.error || 'Failed to probe fields')
      }
    } catch (err) {
      setError('Failed to probe fields')
      console.error(err)
    } finally {
      setIsProbing(false)
      setProbeProgress(null)
    }
  }

  // Handle metafield change
  const handleMetafieldChange = (namespace: string, key: string, enabled: boolean) => {
    setEnabledMetafields((prev) => {
      const existing = prev.find((m) => m.namespace === namespace && m.key === key)
      if (existing) {
        return prev.map((m) =>
          m.namespace === namespace && m.key === key ? { ...m, enabled } : m
        )
      } else {
        return [...prev, { namespace, key, enabled }]
      }
    })
  }

  // Handle schema refresh
  const handleRefreshSchema = async () => {
    setRefreshingSchema(true)
    try {
      await fetchData(true)
      setSuccessMessage('Schema refreshed successfully')
      setTimeout(() => setSuccessMessage(null), 5000)
    } catch (err) {
      setError('Failed to refresh schema')
      console.error(err)
    } finally {
      setRefreshingSchema(false)
    }
  }

  // Save configuration
  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSuccessMessage(null)

    try {
      // Build field updates
      const fieldUpdates = fieldConfig
        .filter((f, i) => f.enabled !== originalFieldConfig[i]?.enabled)
        .map((f) => ({ fieldPath: f.fieldPath, enabled: f.enabled }))

      // Build filter updates
      const filterUpdates = hasStatusChanges
        ? [
            {
              fieldPath: 'status',
              operator: 'in',
              value: JSON.stringify(selectedStatuses),
              enabled: true,
            },
          ]
        : []

      const runtimeUpdates = hasRuntimeChanges
        ? [
            {
              configKey: 'ingestionActiveOnly',
              enabled: runtimeFlags.ingestionActiveOnly,
            },
            {
              configKey: 'transferActiveOnly',
              enabled: runtimeFlags.transferActiveOnly,
            },
          ]
        : []

      const res = await fetch(`/api/admin/shopify/sync-config/${selectedEntity}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: fieldUpdates.length > 0 ? fieldUpdates : undefined,
          filters: filterUpdates.length > 0 ? filterUpdates : undefined,
          runtimeFlags: runtimeUpdates.length > 0 ? runtimeUpdates : undefined,
        }),
      })

      const data = await res.json()

      if (data.success) {
        setOriginalStatuses([...selectedStatuses])
        setOriginalFieldConfig(JSON.parse(JSON.stringify(fieldConfig)))
        setOriginalMetafields(JSON.parse(JSON.stringify(enabledMetafields)))
        setOriginalRuntimeFlags({ ...runtimeFlags })
        setSuccessMessage('Configuration saved. Changes will apply on next sync.')
        setTimeout(() => setSuccessMessage(null), 5000)
        // Trigger sample data refresh
        setSampleRefreshTrigger((prev) => prev + 1)
      } else {
        setError(data.error || 'Failed to save configuration')
      }
    } catch (err) {
      setError('Failed to save configuration')
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  // Discard changes
  const handleDiscard = () => {
    setSelectedStatuses([...originalStatuses])
    setFieldConfig(JSON.parse(JSON.stringify(originalFieldConfig)))
    setEnabledMetafields(JSON.parse(JSON.stringify(originalMetafields)))
    setRuntimeFlags({ ...originalRuntimeFlags })
  }

  const currentEntity = entities.find((e) => e.name === selectedEntity)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading configuration...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Entity Selector with Schema Info */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <EntitySelector
          entities={entities}
          selectedEntity={selectedEntity}
          onSelect={setSelectedEntity}
        />
        <div className="flex items-center gap-2">
          {schemaInfo && (
            <span className="text-xs text-muted-foreground">
              Schema: {schemaInfo.apiVersion} ({formatDate(schemaInfo.fetchedAt)})
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefreshSchema}
            disabled={refreshingSchema}
          >
            {refreshingSchema ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span className="ml-1.5">Refresh Schema</span>
          </Button>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700">{error}</div>
      )}
      {successMessage && (
        <div className="p-4 rounded-lg bg-green-50 border border-green-200 text-green-700">
          {successMessage}
        </div>
      )}

      {/* Status Filter Panel (only for Product/ProductVariant) */}
      {(selectedEntity === 'Product' || selectedEntity === 'ProductVariant') && (
        <StatusFilterPanel
          distribution={distribution}
          selectedStatuses={selectedStatuses}
          onStatusChange={handleStatusChange}
          hasChanges={hasStatusChanges}
        />
      )}

      {/* Runtime Behavior Panel */}
      {(selectedEntity === 'Product' || selectedEntity === 'ProductVariant') && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Runtime Behavior
              {hasRuntimeChanges && (
                <span className="text-xs font-medium px-2 py-1 rounded-full border border-amber-600 text-amber-600">
                  Unsaved
                </span>
              )}
            </CardTitle>
            <CardDescription>
              Control where ACTIVE-only rules are enforced during sync and transfer.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <label className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={runtimeFlags.ingestionActiveOnly}
                  onChange={(e) =>
                    handleRuntimeFlagChange('ingestionActiveOnly', e.target.checked)
                  }
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <div className="flex-1">
                  <div className="font-medium">Ingestion-time ACTIVE-only</div>
                  <div className="text-sm text-muted-foreground">
                    Skip writing non-ACTIVE variants into RawSkusFromShopify during sync.
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={runtimeFlags.transferActiveOnly}
                  onChange={(e) =>
                    handleRuntimeFlagChange('transferActiveOnly', e.target.checked)
                  }
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <div className="flex-1">
                  <div className="font-medium">Transfer-time ACTIVE-only</div>
                  <div className="text-sm text-muted-foreground">
                    Treat non-ACTIVE variants as unavailable during Shopify transfer validation.
                  </div>
                </div>
              </label>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Field Configuration Panel */}
      <FieldConfigPanel
        entityType={selectedEntity}
        fields={fieldConfig}
        onFieldChange={handleFieldChange}
        onBulkAction={handleBulkAction}
        onProbeFields={handleProbeFields}
        isProbing={isProbing}
        probeProgress={probeProgress ?? undefined}
        hasUnsavedChanges={hasFieldChanges}
      />

      {/* Metafields Panel (if entity supports metafields) */}
      {currentEntity?.hasMetafields && (
        <MetafieldsPanel
          entityType={selectedEntity}
          enabledMetafields={enabledMetafields}
          onMetafieldChange={handleMetafieldChange}
          hasUnsavedChanges={hasMetafieldChanges}
        />
      )}

      {/* Sample Data Viewer */}
      <SampleDataViewer entityType={selectedEntity} refreshTrigger={sampleRefreshTrigger} />

      {/* Action Bar */}
      <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border border-border">
        <div className="text-sm text-muted-foreground">
          {hasUnsavedChanges ? (
            <span className="text-amber-600 font-medium">You have unsaved changes</span>
          ) : (
            'Configuration is up to date'
          )}
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={handleDiscard} disabled={!hasUnsavedChanges || saving}>
            Discard
          </Button>
          <Button onClick={handleSave} disabled={!hasUnsavedChanges || saving}>
            {saving ? 'Saving...' : 'Save Configuration'}
          </Button>
        </div>
      </div>

      {/* Info Card */}
      <Card>
        <CardHeader>
          <CardTitle>How It Works</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            <strong>1. Configure fields:</strong> Toggle which fields to include in the sync.
            Protected fields (with lock icons) cannot be disabled.
          </p>
          <p>
            <strong>2. Test access:</strong> Click &quot;Probe All Fields&quot; to verify your API
            token can access each field.
          </p>
          <p>
            <strong>3. Preview data:</strong> The Sample Data Viewer shows what data will be synced
            with your current configuration.
          </p>
          <p>
            <strong>4. Save configuration:</strong> Click &quot;Save Configuration&quot; to store
            your settings. Changes are saved to the database.
          </p>
          <p className="pt-2 border-t border-border mt-4">
            <strong>Note:</strong> The sync runs automatically on a schedule and can also be
            triggered manually from the{' '}
            <Link href="/admin/shopify" className="text-primary hover:underline">
              Shopify Integration
            </Link>{' '}
            page.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
