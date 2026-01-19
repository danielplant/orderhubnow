'use client'

/**
 * Developer Tools Client Component
 *
 * Interactive UI for configuring Shopify sync:
 * - Entity selector (Product, ProductVariant, etc.)
 * - Status filter configuration with checkboxes
 * - Filter impact preview
 * - Save/discard controls
 */

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

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
          <div className="grid grid-cols-3 gap-4">
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
    <div className="flex gap-2 mb-6">
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
  const [entities, setEntities] = useState<Entity[]>([])
  const [selectedEntity, setSelectedEntity] = useState('Product')
  const [distribution, setDistribution] = useState<FilterDistribution | null>(null)
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(['ACTIVE'])
  const [originalStatuses, setOriginalStatuses] = useState<string[]>(['ACTIVE'])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const hasChanges = JSON.stringify(selectedStatuses.sort()) !== JSON.stringify(originalStatuses.sort())

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

  // Fetch distribution and config when entity changes
  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const [distRes, configRes] = await Promise.all([
        fetch(`/api/admin/shopify/filter-preview/${selectedEntity}`),
        fetch(`/api/admin/shopify/sync-config/${selectedEntity}`),
      ])

      const distData = await distRes.json()
      const configData = await configRes.json()

      if (distData.success) {
        setDistribution(distData)
      }

      if (configData.success) {
        // Parse current status filter
        const statusFilter = configData.filters.find(
          (f: { fieldPath: string }) => f.fieldPath === 'status'
        )
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
          // No filter configured - default to all
          setSelectedStatuses(['ACTIVE', 'DRAFT', 'ARCHIVED'])
          setOriginalStatuses(['ACTIVE', 'DRAFT', 'ARCHIVED'])
        }
      }
    } catch (err) {
      setError('Failed to load configuration')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [selectedEntity])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Handle status checkbox change
  const handleStatusChange = (status: string, checked: boolean) => {
    setSelectedStatuses((prev) => {
      if (checked) {
        return [...prev, status]
      } else {
        // Prevent deselecting all
        if (prev.length === 1) {
          return prev
        }
        return prev.filter((s) => s !== status)
      }
    })
  }

  // Save configuration
  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const res = await fetch(`/api/admin/shopify/sync-config/${selectedEntity}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filters: [
            {
              fieldPath: 'status',
              operator: 'in',
              value: JSON.stringify(selectedStatuses),
              enabled: true,
            },
          ],
        }),
      })

      const data = await res.json()

      if (data.success) {
        setOriginalStatuses([...selectedStatuses])
        setSuccessMessage('Configuration saved. Changes will apply on next sync.')
        setTimeout(() => setSuccessMessage(null), 5000)
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
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        Loading configuration...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Entity Selector */}
      <EntitySelector
        entities={entities}
        selectedEntity={selectedEntity}
        onSelect={setSelectedEntity}
      />

      {/* Error Message */}
      {error && (
        <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700">{error}</div>
      )}

      {/* Success Message */}
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
          hasChanges={hasChanges}
        />
      )}

      {/* Other entities placeholder */}
      {selectedEntity !== 'Product' && selectedEntity !== 'ProductVariant' && (
        <Card>
          <CardHeader>
            <CardTitle>{selectedEntity} Configuration</CardTitle>
            <CardDescription>
              Sync configuration for {selectedEntity} entities is coming soon.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Currently, only Product and ProductVariant status filtering is implemented.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Action Bar */}
      {(selectedEntity === 'Product' || selectedEntity === 'ProductVariant') && (
        <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border border-border">
          <div className="text-sm text-muted-foreground">
            {hasChanges ? (
              <span className="text-amber-600 font-medium">You have unsaved changes</span>
            ) : (
              'Configuration is up to date'
            )}
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={handleDiscard} disabled={!hasChanges || saving}>
              Discard
            </Button>
            <Button onClick={handleSave} disabled={!hasChanges || saving}>
              {saving ? 'Saving...' : 'Save Configuration'}
            </Button>
          </div>
        </div>
      )}

      {/* Info Card */}
      <Card>
        <CardHeader>
          <CardTitle>How It Works</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            <strong>1. Select statuses:</strong> Choose which product statuses (ACTIVE, DRAFT,
            ARCHIVED) should be included in the sync.
          </p>
          <p>
            <strong>2. Save configuration:</strong> Click &quot;Save Configuration&quot; to store your
            settings. Changes are saved to the database.
          </p>
          <p>
            <strong>3. Next sync:</strong> When the next Shopify sync runs, only products matching
            your selected statuses will be included in the Sku table.
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
