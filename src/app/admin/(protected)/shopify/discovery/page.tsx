/**
 * Shopify Discovery Page
 * ============================================================================
 * Unified UI for exploring Shopify schema and database tables with mapping
 * visualization. Combines:
 * - Schema browser (Shopify resources and DB tables)
 * - Field configuration and mapping status
 * - Sample data preview
 *
 * Path: src/app/admin/(protected)/shopify/discovery/page.tsx
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Database,
  ShoppingBag,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Check,
  X,
  ArrowRight,
  Loader2,
  Eye,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

// ============================================================================
// Types
// ============================================================================

interface TableColumn {
  name: string
  type: string
  nullable: boolean
}

interface TableInfo {
  name: string
  columns: TableColumn[]
}

interface ShopifyField {
  name: string
  type: string
  description?: string
}

interface ShopifyResource {
  name: string
  fields: ShopifyField[]
}

interface SchemaData {
  database?: {
    tables: TableInfo[]
    lastUpdated?: string
  }
  shopify?: {
    resources: ShopifyResource[]
    lastUpdated?: string
  }
}

interface FieldMapping {
  sourceField: string
  targetColumn: string
  enabled: boolean
  category: string
}

interface MappingInfo {
  entityType: string
  targetTable: string
  mappings: FieldMapping[]
}

// ============================================================================
// Main Component
// ============================================================================

export default function DiscoveryPage() {
  // Schema state
  const [schemaData, setSchemaData] = useState<SchemaData | null>(null)
  const [loading, setLoading] = useState<'database' | 'shopify' | 'both' | null>(null)
  const [error, setError] = useState<string | null>(null)

  // UI state
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set())
  const [expandedResources, setExpandedResources] = useState<Set<string>>(new Set())
  const [selectedEntity, setSelectedEntity] = useState<string>('ProductVariant')
  const [mappingInfo, setMappingInfo] = useState<MappingInfo | null>(null)

  // Sample data state
  const [sampleData, setSampleData] = useState<Record<string, unknown>[] | null>(null)
  const [loadingSample, setLoadingSample] = useState(false)

  // Fetch both schemas on mount
  useEffect(() => {
    fetchBothSchemas()
  }, [])

  // Fetch mapping info when entity changes
  useEffect(() => {
    fetchMappingInfo()
  }, [selectedEntity])

  const fetchBothSchemas = async () => {
    setLoading('both')
    setError(null)

    try {
      const [dbRes, shopifyRes] = await Promise.all([
        fetch('/api/admin/shopify/sync/discovery?source=database'),
        fetch('/api/admin/shopify/sync/discovery?source=shopify'),
      ])

      const [dbData, shopifyData] = await Promise.all([dbRes.json(), shopifyRes.json()])

      setSchemaData({
        database: dbData.database,
        shopify: shopifyData.shopify,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch schemas')
    } finally {
      setLoading(null)
    }
  }

  const fetchMappingInfo = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/shopify/sync-config/${selectedEntity}`)
      const data = await res.json()

      if (data.success) {
        // Build mapping info from field config
        const mappings: FieldMapping[] = data.fields
          .filter((f: { enabled: boolean; isMetafield: boolean }) => f.enabled && !f.isMetafield)
          .map((f: { fieldPath: string; dbColumn?: string; category: string }) => ({
            sourceField: f.fieldPath,
            targetColumn: f.dbColumn || f.fieldPath,
            enabled: true,
            category: f.category,
          }))

        setMappingInfo({
          entityType: selectedEntity,
          targetTable: selectedEntity === 'ProductVariant' ? 'Sku' : selectedEntity,
          mappings,
        })
      }
    } catch (err) {
      console.error('Failed to fetch mapping info:', err)
    }
  }, [selectedEntity])

  const fetchSampleData = async () => {
    setLoadingSample(true)
    try {
      const res = await fetch(`/api/admin/shopify/sample-data/${selectedEntity}?limit=3`)
      const data = await res.json()
      if (data.success) {
        setSampleData(data.data)
      }
    } catch (err) {
      console.error('Failed to fetch sample data:', err)
    } finally {
      setLoadingSample(false)
    }
  }

  const refreshSchema = async (source: 'database' | 'shopify') => {
    setLoading(source)
    setError(null)

    try {
      const res = await fetch('/api/admin/shopify/sync/discovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source }),
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to refresh schema')
      }

      setSchemaData((prev) => ({
        ...prev,
        [source]: data[source],
      }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh schema')
    } finally {
      setLoading(null)
    }
  }

  const toggleTable = (tableName: string) => {
    setExpandedTables((prev) => {
      const next = new Set(prev)
      if (next.has(tableName)) {
        next.delete(tableName)
      } else {
        next.add(tableName)
      }
      return next
    })
  }

  const toggleResource = (resourceName: string) => {
    setExpandedResources((prev) => {
      const next = new Set(prev)
      if (next.has(resourceName)) {
        next.delete(resourceName)
      } else {
        next.add(resourceName)
      }
      return next
    })
  }

  // Get the current mapping target table
  const targetTable = schemaData?.database?.tables.find(
    (t) => t.name === mappingInfo?.targetTable
  )

  // Get the current Shopify resource
  const currentResource = schemaData?.shopify?.resources.find((r) => r.name === selectedEntity)

  return (
    <main className="p-6 bg-muted/30 min-h-screen">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Schema Discovery</h1>
          <p className="text-muted-foreground mt-1">
            Explore Shopify resources and database tables with mapping visualization
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchBothSchemas}
            disabled={loading === 'both'}
          >
            {loading === 'both' ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Refresh All
          </Button>
          <Link href="/admin/shopify/config">
            <Button size="sm">Configure Fields</Button>
          </Link>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-lg border border-red-200 bg-red-50 text-red-700">
          {error}
        </div>
      )}

      {/* Entity Selector */}
      <div className="flex flex-wrap gap-2 mb-6">
        {['Product', 'ProductVariant', 'Customer', 'Collection'].map((entity) => (
          <button
            key={entity}
            onClick={() => setSelectedEntity(entity)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              selectedEntity === entity
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted hover:bg-muted/80 text-muted-foreground'
            }`}
          >
            {entity}
          </button>
        ))}
      </div>

      {/* Main Grid - 3 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Shopify Schema (Left) */}
        <Card className="h-fit">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingBag className="h-5 w-5 text-green-600" />
                <CardTitle className="text-base">Shopify Fields</CardTitle>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => refreshSchema('shopify')}
                disabled={loading === 'shopify'}
              >
                <RefreshCw
                  className={`h-4 w-4 ${loading === 'shopify' ? 'animate-spin' : ''}`}
                />
              </Button>
            </div>
            <CardDescription>Available fields from {selectedEntity}</CardDescription>
          </CardHeader>
          <CardContent className="max-h-[500px] overflow-y-auto">
            {!currentResource ? (
              <p className="text-sm text-muted-foreground">Loading schema...</p>
            ) : (
              <div className="space-y-1">
                {currentResource.fields.map((field) => {
                  const isMapped = mappingInfo?.mappings.some(
                    (m) => m.sourceField === field.name || m.sourceField.endsWith(`.${field.name}`)
                  )
                  return (
                    <div
                      key={field.name}
                      className={`flex items-center gap-2 py-1.5 px-2 rounded text-sm ${
                        isMapped ? 'bg-green-50 border border-green-200' : 'hover:bg-muted/50'
                      }`}
                    >
                      {isMapped ? (
                        <Check className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
                      ) : (
                        <X className="h-3.5 w-3.5 text-muted-foreground/50 flex-shrink-0" />
                      )}
                      <span className="font-mono text-xs">{field.name}</span>
                      <span className="text-xs text-muted-foreground ml-auto">{field.type}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Mapping Visualization (Center) */}
        <Card className="h-fit">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ArrowRight className="h-5 w-5 text-blue-600" />
                <CardTitle className="text-base">Active Mappings</CardTitle>
              </div>
              <span className="text-xs text-muted-foreground">
                {mappingInfo?.mappings.length || 0} fields mapped
              </span>
            </div>
            <CardDescription>
              {selectedEntity} → {mappingInfo?.targetTable || '...'}
            </CardDescription>
          </CardHeader>
          <CardContent className="max-h-[500px] overflow-y-auto">
            {!mappingInfo ? (
              <p className="text-sm text-muted-foreground">Loading mappings...</p>
            ) : mappingInfo.mappings.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active mappings</p>
            ) : (
              <div className="space-y-1">
                {mappingInfo.mappings.map((mapping, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 py-1.5 px-2 rounded text-xs bg-blue-50/50 border border-blue-100"
                  >
                    <span className="font-mono text-blue-700 truncate flex-1">
                      {mapping.sourceField}
                    </span>
                    <ArrowRight className="h-3 w-3 text-blue-400 flex-shrink-0" />
                    <span className="font-mono text-blue-700 truncate flex-1 text-right">
                      {mapping.targetColumn}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Database Schema (Right) */}
        <Card className="h-fit">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="h-5 w-5 text-purple-600" />
                <CardTitle className="text-base">Database Columns</CardTitle>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => refreshSchema('database')}
                disabled={loading === 'database'}
              >
                <RefreshCw
                  className={`h-4 w-4 ${loading === 'database' ? 'animate-spin' : ''}`}
                />
              </Button>
            </div>
            <CardDescription>Target table: {mappingInfo?.targetTable || '...'}</CardDescription>
          </CardHeader>
          <CardContent className="max-h-[500px] overflow-y-auto">
            {!targetTable ? (
              <p className="text-sm text-muted-foreground">Loading schema...</p>
            ) : (
              <div className="space-y-1">
                {targetTable.columns.map((col) => {
                  const isMapped = mappingInfo?.mappings.some(
                    (m) => m.targetColumn === col.name
                  )
                  return (
                    <div
                      key={col.name}
                      className={`flex items-center gap-2 py-1.5 px-2 rounded text-sm ${
                        isMapped ? 'bg-purple-50 border border-purple-200' : 'hover:bg-muted/50'
                      }`}
                    >
                      {isMapped ? (
                        <Check className="h-3.5 w-3.5 text-purple-600 flex-shrink-0" />
                      ) : (
                        <div className="w-3.5" />
                      )}
                      <span className="font-mono text-xs">{col.name}</span>
                      <span className="text-xs text-muted-foreground ml-auto">
                        {col.type}
                        {col.nullable && ' ?'}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* All Tables/Resources Browser */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        {/* All Shopify Resources */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <ShoppingBag className="h-5 w-5" />
                All Shopify Resources
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="max-h-[400px] overflow-y-auto">
            {!schemaData?.shopify ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : (
              <div className="divide-y divide-border">
                {schemaData.shopify.resources.map((resource) => (
                  <div key={resource.name}>
                    <button
                      onClick={() => toggleResource(resource.name)}
                      className="w-full px-2 py-2 text-left text-sm flex items-center gap-2 hover:bg-muted/50 rounded"
                    >
                      {expandedResources.has(resource.name) ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                      <span className="font-mono">{resource.name}</span>
                      <span className="text-muted-foreground text-xs">
                        ({resource.fields.length} fields)
                      </span>
                    </button>
                    {expandedResources.has(resource.name) && (
                      <div className="bg-muted/30 px-6 py-2 rounded mb-2">
                        {resource.fields.slice(0, 20).map((field) => (
                          <div key={field.name} className="py-0.5 text-xs flex items-center gap-2">
                            <span className="font-mono">{field.name}</span>
                            <span className="text-muted-foreground">{field.type}</span>
                          </div>
                        ))}
                        {resource.fields.length > 20 && (
                          <div className="text-xs text-muted-foreground py-1">
                            ...and {resource.fields.length - 20} more
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* All Database Tables */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                All Database Tables
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="max-h-[400px] overflow-y-auto">
            {!schemaData?.database ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : (
              <div className="divide-y divide-border">
                {schemaData.database.tables.map((table) => (
                  <div key={table.name}>
                    <button
                      onClick={() => toggleTable(table.name)}
                      className="w-full px-2 py-2 text-left text-sm flex items-center gap-2 hover:bg-muted/50 rounded"
                    >
                      {expandedTables.has(table.name) ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                      <span className="font-mono">{table.name}</span>
                      <span className="text-muted-foreground text-xs">
                        ({table.columns.length} columns)
                      </span>
                    </button>
                    {expandedTables.has(table.name) && (
                      <div className="bg-muted/30 px-6 py-2 rounded mb-2">
                        {table.columns.map((col) => (
                          <div key={col.name} className="py-0.5 text-xs flex items-center gap-2">
                            <span className="font-mono">{col.name}</span>
                            <span className="text-muted-foreground">{col.type}</span>
                            {col.nullable && (
                              <span className="text-muted-foreground italic">nullable</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Sample Data Preview */}
      <Card className="mt-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Sample Data Preview
            </CardTitle>
            <Button variant="outline" size="sm" onClick={fetchSampleData} disabled={loadingSample}>
              {loadingSample ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Load Sample
            </Button>
          </div>
          <CardDescription>
            Preview sample records from {selectedEntity} with current configuration
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!sampleData ? (
            <p className="text-sm text-muted-foreground">
              Click &quot;Load Sample&quot; to fetch sample data from Shopify
            </p>
          ) : sampleData.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sample data available</p>
          ) : (
            <div className="space-y-4">
              {sampleData.map((item, idx) => (
                <pre
                  key={idx}
                  className="p-4 rounded-lg bg-muted/50 text-xs font-mono overflow-x-auto max-h-[200px]"
                >
                  {JSON.stringify(item, null, 2)}
                </pre>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
