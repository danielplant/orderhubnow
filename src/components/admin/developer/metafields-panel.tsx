'use client'

/**
 * Metafields Discovery Panel
 *
 * UI for discovering and enabling metafield definitions from Shopify.
 */

import { useState, useEffect } from 'react'
import { ChevronDown, ChevronRight, RefreshCw, Loader2 } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

// ============================================================================
// Types
// ============================================================================

export interface MetafieldDefinition {
  namespace: string
  key: string
  type: string
  description?: string
}

export interface EnabledMetafield {
  namespace: string
  key: string
  enabled: boolean
}

export interface MetafieldsPanelProps {
  entityType: string
  enabledMetafields: EnabledMetafield[]
  onMetafieldChange: (namespace: string, key: string, enabled: boolean) => void
  hasUnsavedChanges?: boolean
}

// ============================================================================
// Namespace Section Component
// ============================================================================

interface NamespaceSectionProps {
  namespace: string
  definitions: MetafieldDefinition[]
  enabledMetafields: EnabledMetafield[]
  isExpanded: boolean
  onToggle: () => void
  onMetafieldChange: (namespace: string, key: string, enabled: boolean) => void
}

function NamespaceSection({
  namespace,
  definitions,
  enabledMetafields,
  isExpanded,
  onToggle,
  onMetafieldChange,
}: NamespaceSectionProps) {
  const enabledCount = definitions.filter((d) =>
    enabledMetafields.some((m) => m.namespace === d.namespace && m.key === d.key && m.enabled)
  ).length

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Namespace Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <span className="font-mono text-sm font-medium">{namespace}</span>
          <span className="text-xs text-muted-foreground ml-2">
            ({enabledCount}/{definitions.length} enabled)
          </span>
        </div>
      </button>

      {/* Definitions */}
      {isExpanded && (
        <div className="p-2 space-y-1">
          {definitions.map((def) => {
            const isEnabled = enabledMetafields.some(
              (m) => m.namespace === def.namespace && m.key === def.key && m.enabled
            )

            return (
              <label
                key={`${def.namespace}.${def.key}`}
                className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  checked={isEnabled}
                  onChange={(e) => onMetafieldChange(def.namespace, def.key, e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{def.key}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                      {def.type}
                    </span>
                  </div>
                  {def.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{def.description}</p>
                  )}
                </div>
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function MetafieldsPanel({
  entityType,
  enabledMetafields,
  onMetafieldChange,
  hasUnsavedChanges = false,
}: MetafieldsPanelProps) {
  const [definitions, setDefinitions] = useState<MetafieldDefinition[]>([])
  const [byNamespace, setByNamespace] = useState<Record<string, MetafieldDefinition[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedNamespaces, setExpandedNamespaces] = useState<Set<string>>(new Set())

  const fetchDefinitions = async () => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/admin/shopify/metafields/${entityType}`)
      const data = await res.json()

      if (!data.success) {
        setError(data.error || 'Failed to load metafield definitions')
        return
      }

      setDefinitions(data.definitions || [])
      setByNamespace(data.byNamespace || {})

      // Expand first namespace by default
      if (data.byNamespace && Object.keys(data.byNamespace).length > 0) {
        setExpandedNamespaces(new Set([Object.keys(data.byNamespace)[0]]))
      }
    } catch (err) {
      setError('Failed to fetch metafield definitions')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDefinitions()
  }, [entityType])

  const toggleNamespace = (namespace: string) => {
    setExpandedNamespaces((prev) => {
      const next = new Set(prev)
      if (next.has(namespace)) {
        next.delete(namespace)
      } else {
        next.add(namespace)
      }
      return next
    })
  }

  const namespaces = Object.keys(byNamespace).sort()

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              Metafield Definitions
              {hasUnsavedChanges && (
                <span className="text-xs font-medium px-2 py-1 rounded-full border border-amber-600 text-amber-600">
                  Unsaved
                </span>
              )}
            </CardTitle>
            <CardDescription>
              Discover and enable metafields defined in your Shopify store for {entityType}.
              {definitions.length > 0 && (
                <span className="ml-1">
                  Found {definitions.length} definitions across {namespaces.length} namespaces.
                </span>
              )}
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchDefinitions}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span className="ml-1.5">Refresh</span>
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {loading && definitions.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading metafield definitions...
          </div>
        ) : error ? (
          <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        ) : namespaces.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No metafield definitions found for {entityType}.</p>
            <p className="text-sm mt-2">
              Create metafield definitions in Shopify Admin under Settings {'->'} Metafields.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {namespaces.map((namespace) => (
              <NamespaceSection
                key={namespace}
                namespace={namespace}
                definitions={byNamespace[namespace]}
                enabledMetafields={enabledMetafields}
                isExpanded={expandedNamespaces.has(namespace)}
                onToggle={() => toggleNamespace(namespace)}
                onMetafieldChange={onMetafieldChange}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
