'use client'

/**
 * Developer Tools Client Component
 *
 * Interactive UI for configuring Shopify sync:
 * - Entity selector (Product, ProductVariant, etc.)
 * - Status cascade pipeline (Available > Ingestion > SKU > Transfer)
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
import { StatusCascadePanel, StatusCascadeConfig } from './status-cascade-panel'
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
  statusCascade: StatusCascadeConfig
  validStatuses: readonly string[]
  protectedFields: string[]
  schemaInfo?: {
    apiVersion: string
    fetchedAt: string
  }
  error?: string
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

const DEFAULT_CASCADE: StatusCascadeConfig = {
  ingestionAllowed: ['ACTIVE', 'DRAFT', 'ARCHIVED'],
  skuAllowed: ['ACTIVE'],
  transferAllowed: ['ACTIVE'],
}

export function DeveloperToolsClient() {
  // Entity state
  const [entities, setEntities] = useState<Entity[]>([])
  const [selectedEntity, setSelectedEntity] = useState('Product')

  // Status cascade state (new model)
  const [distribution, setDistribution] = useState<FilterDistribution | null>(null)
  const [statusCascade, setStatusCascade] = useState<StatusCascadeConfig>(DEFAULT_CASCADE)
  const [originalCascade, setOriginalCascade] = useState<StatusCascadeConfig>(DEFAULT_CASCADE)
  const [validStatuses, setValidStatuses] = useState<readonly string[]>(['ACTIVE', 'DRAFT', 'ARCHIVED'])

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
  const hasCascadeChanges =
    JSON.stringify(statusCascade) !== JSON.stringify(originalCascade)

  const hasFieldChanges =
    JSON.stringify(fieldConfig.map((f) => ({ path: f.fieldPath, enabled: f.enabled })).sort()) !==
    JSON.stringify(
      originalFieldConfig.map((f) => ({ path: f.fieldPath, enabled: f.enabled })).sort()
    )

  const hasMetafieldChanges =
    JSON.stringify(enabledMetafields.sort()) !== JSON.stringify(originalMetafields.sort())

  const hasUnsavedChanges =
    hasCascadeChanges || hasFieldChanges || hasMetafieldChanges

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
          // Set status cascade config (new model)
          if (configData.statusCascade) {
            setStatusCascade(configData.statusCascade)
            setOriginalCascade(JSON.parse(JSON.stringify(configData.statusCascade)))
          }
          if (configData.validStatuses) {
            setValidStatuses(configData.validStatuses)
          }

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

  // Handle status cascade change
  const handleCascadeChange = (newCascade: StatusCascadeConfig) => {
    setStatusCascade(newCascade)
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

      const res = await fetch(`/api/admin/shopify/sync-config/${selectedEntity}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: fieldUpdates.length > 0 ? fieldUpdates : undefined,
          statusCascade: hasCascadeChanges ? statusCascade : undefined,
        }),
      })

      const data = await res.json()

      if (data.success) {
        setOriginalCascade(JSON.parse(JSON.stringify(statusCascade)))
        setOriginalFieldConfig(JSON.parse(JSON.stringify(fieldConfig)))
        setOriginalMetafields(JSON.parse(JSON.stringify(enabledMetafields)))
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
    setStatusCascade(JSON.parse(JSON.stringify(originalCascade)))
    setFieldConfig(JSON.parse(JSON.stringify(originalFieldConfig)))
    setEnabledMetafields(JSON.parse(JSON.stringify(originalMetafields)))
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

      {/* Status Cascade Panel (only for Product/ProductVariant) */}
      {(selectedEntity === 'Product' || selectedEntity === 'ProductVariant') && (
        <StatusCascadePanel
          distribution={distribution?.distribution ?? null}
          config={statusCascade}
          validStatuses={validStatuses}
          onChange={handleCascadeChange}
          hasChanges={hasCascadeChanges}
        />
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
