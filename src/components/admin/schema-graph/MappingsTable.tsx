'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Lock, Check, X, ExternalLink, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'

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
  fieldType?: string // Phase 3: needed for toggle logic
  createdAt: string
  updatedAt: string
}

interface Props {
  mappings: FieldMapping[]
  onRefresh?: () => void
  onToggleEnabled?: (id: number, currentEnabled: boolean, fieldType: string) => void
}

// ============================================================================
// Main Component
// ============================================================================

export function MappingsTable({ mappings, onRefresh, onToggleEnabled }: Props) {
  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [entityFilter, setEntityFilter] = useState<string>('all')
  const [enabledFilter, setEnabledFilter] = useState<string>('all')

  // Get unique entity types for filter dropdown
  const entityTypes = useMemo(() => {
    const types = new Set(mappings.map((m) => m.entityType))
    return Array.from(types).sort()
  }, [mappings])

  // Filtered mappings
  const filteredMappings = useMemo(() => {
    return mappings.filter((m) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const matchesPath = m.fullPath.toLowerCase().includes(query)
        const matchesTable = m.targetTable?.toLowerCase().includes(query)
        const matchesColumn = m.targetColumn?.toLowerCase().includes(query)
        if (!matchesPath && !matchesTable && !matchesColumn) return false
      }

      // Entity filter
      if (entityFilter !== 'all' && m.entityType !== entityFilter) return false

      // Enabled filter
      if (enabledFilter === 'enabled' && !m.enabled) return false
      if (enabledFilter === 'disabled' && m.enabled) return false

      return true
    })
  }, [mappings, searchQuery, entityFilter, enabledFilter])

  // Stats
  const stats = useMemo(() => ({
    total: mappings.length,
    enabled: mappings.filter((m) => m.enabled).length,
    protected: mappings.filter((m) => m.isProtected).length,
    mapped: mappings.filter((m) => m.targetTable).length,
  }), [mappings])

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="flex gap-6 text-sm text-muted-foreground">
        <span>{stats.total} total mappings</span>
        <span>{stats.enabled} enabled</span>
        <span>{stats.protected} protected</span>
        <span>{stats.mapped} with target</span>
      </div>

      {/* Filters */}
      <div className="flex gap-4 items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search fields, tables, columns..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={entityFilter} onValueChange={setEntityFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All entities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All entities</SelectItem>
            {entityTypes.map((type) => (
              <SelectItem key={type} value={type}>
                {type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={enabledFilter} onValueChange={setEnabledFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="enabled">Enabled</SelectItem>
            <SelectItem value="disabled">Disabled</SelectItem>
          </SelectContent>
        </Select>

        {onRefresh && (
          <Button variant="outline" size="sm" onClick={onRefresh}>
            Refresh
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3 font-medium">Shopify Field</th>
              <th className="text-left p-3 font-medium">Target Table</th>
              <th className="text-left p-3 font-medium">Target Column</th>
              <th className="text-left p-3 font-medium">Transform</th>
              <th className="text-center p-3 font-medium">Enabled</th>
              <th className="text-center p-3 font-medium">Protected</th>
              <th className="text-left p-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredMappings.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-muted-foreground">
                  No mappings found
                </td>
              </tr>
            ) : (
              filteredMappings.map((mapping) => (
                <tr key={mapping.id} className="hover:bg-muted/30">
                  <td className="p-3">
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                      {mapping.fullPath}
                    </code>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Depth: {mapping.depth}
                    </div>
                  </td>
                  <td className="p-3">
                    {mapping.targetTable || (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="p-3">
                    {mapping.targetColumn || (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="p-3">
                    <span className="capitalize">{mapping.transformType}</span>
                  </td>
                  <td className="p-3 text-center">
                    {onToggleEnabled ? (
                      <div className="flex items-center justify-center gap-1">
                        <input
                          type="checkbox"
                          checked={mapping.enabled}
                          onChange={() => onToggleEnabled(mapping.id, mapping.enabled, mapping.fieldType || '')}
                          disabled={mapping.isProtected || mapping.fieldType !== 'metafield'}
                          className="rounded disabled:opacity-50 disabled:cursor-not-allowed"
                          title={
                            mapping.isProtected 
                              ? 'Protected field cannot be disabled' 
                              : mapping.fieldType !== 'metafield'
                                ? 'Only metafield fields can be toggled'
                                : undefined
                          }
                        />
                        {mapping.fieldType !== 'metafield' && !mapping.isProtected && (
                          <span className="text-muted-foreground text-xs" title="Non-metafield fields are fixed">
                            (fixed)
                          </span>
                        )}
                      </div>
                    ) : (
                      mapping.enabled ? (
                        <Check className="w-4 h-4 text-green-600 mx-auto" />
                      ) : (
                        <X className="w-4 h-4 text-muted-foreground mx-auto" />
                      )
                    )}
                  </td>
                  <td className="p-3 text-center">
                    {mapping.isProtected && (
                      <Lock className="w-4 h-4 text-amber-600 mx-auto" />
                    )}
                  </td>
                  <td className="p-3">
                    <Link
                      href={`/admin/dev/shopify/schema?field=${encodeURIComponent(mapping.fullPath)}`}
                      className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                    >
                      Edit
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="text-sm text-muted-foreground">
        Showing {filteredMappings.length} of {mappings.length} mappings
      </div>
    </div>
  )
}
