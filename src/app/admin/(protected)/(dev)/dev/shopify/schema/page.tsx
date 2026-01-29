'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { ReactFlow, Background, Controls, MiniMap } from '@xyflow/react'
import { Loader2, RefreshCw, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { schemaNodeTypes, MINIMAP_COLORS, FieldConfigModal } from '@/components/admin/schema-graph'
import type { FieldMappingFormData } from '@/components/admin/schema-graph/FieldConfigModal'
import type { SchemaNode, SchemaEdge, EntityNodeData, FieldNodeData } from '@/lib/types/schema-graph'
import '@xyflow/react/dist/style.css'

// ============================================================================
// Types
// ============================================================================

type LoadState = 'loading' | 'success' | 'empty' | 'error'

interface Stats {
  entityCount: number
  fieldCount: number
  durationMs: number
}

// ============================================================================
// Main Component
// ============================================================================

export default function SchemaGraphPage() {
  // State
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [nodes, setNodes] = useState<SchemaNode[]>([])
  const [edges, setEdges] = useState<SchemaEdge[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Collapse-by-default: track which entities are expanded
  const [expandedEntities, setExpandedEntities] = useState<Set<string>>(new Set())

  // Selected field for config modal (Step 9)
  const [selectedField, setSelectedField] = useState<FieldNodeData | null>(null)

  // Toggle entity expansion
  const toggleEntity = useCallback((entityName: string) => {
    setExpandedEntities((prev) => {
      const next = new Set(prev)
      if (next.has(entityName)) {
        next.delete(entityName)
      } else {
        next.add(entityName)
      }
      return next
    })
  }, [])

  // Data fetching
  const fetchGraph = useCallback(async () => {
    // Only show full loading on initial load
    if (loadState === 'success') {
      setIsRefreshing(true)
    } else {
      setLoadState('loading')
    }
    setError(null)

    try {
      const res = await fetch('/api/admin/shopify/schema')
      const data = await res.json()

      // Handle empty cache (404 with CACHE_EMPTY code)
      if (res.status === 404 && data.code === 'CACHE_EMPTY') {
        setLoadState('empty')
        setHint(data.hint || null)
        return
      }

      // Handle other errors
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`)
      }

      // Transform entity nodes to inject onToggle handler and sync isExpanded state
      const nodesWithHandlers = (data.nodes as SchemaNode[]).map((node) => {
        if (node.data.nodeType === 'entity') {
          const entityData = node.data as EntityNodeData
          return {
            ...node,
            data: {
              ...entityData,
              isExpanded: expandedEntities.has(entityData.entityName),
              onToggle: () => toggleEntity(entityData.entityName),
            },
          }
        }
        return node
      })

      setNodes(nodesWithHandlers)
      setEdges(data.edges)
      setStats({
        entityCount: data.entityCount,
        fieldCount: data.fieldCount,
        durationMs: data._meta?.durationMs || 0,
      })
      setLoadState('success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load graph')
      setLoadState('error')
    } finally {
      setIsRefreshing(false)
    }
  }, [loadState, expandedEntities, toggleEntity])

  // Update node handlers when expandedEntities changes
  // Note: We intentionally exclude nodes.length from deps - we only want to update
  // when expansion state changes, not on every node update (which would cause infinite loop)
  useEffect(() => {
    if (loadState === 'success' && nodes.length > 0) {
      setNodes((prevNodes) =>
        prevNodes.map((node) => {
          if (node.data.nodeType === 'entity') {
            const entityData = node.data as EntityNodeData
            return {
              ...node,
              data: {
                ...entityData,
                isExpanded: expandedEntities.has(entityData.entityName),
                onToggle: () => toggleEntity(entityData.entityName),
              },
            }
          }
          return node
        })
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedEntities, toggleEntity, loadState])

  // Fetch on mount
  useEffect(() => {
    fetchGraph()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Intentionally only on mount

  // Filter visible nodes based on entity expansion state
  const visibleNodes = useMemo(() => {
    return nodes.filter((node) => {
      // Always show entity nodes
      if (node.data.nodeType === 'entity') return true
      // Only show field nodes if their parent entity is expanded
      const fieldData = node.data as FieldNodeData
      return expandedEntities.has(fieldData.parentEntity)
    })
  }, [nodes, expandedEntities])

  // Filter visible edges based on visible nodes
  const visibleEdges = useMemo(() => {
    const visibleNodeIds = new Set(visibleNodes.map((n) => n.id))
    return edges.filter((e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target))
  }, [edges, visibleNodes])

  // MiniMap node color function
  const getMinimapNodeColor = useCallback((node: SchemaNode) => {
    return node.data?.nodeType === 'entity' ? MINIMAP_COLORS.entity : MINIMAP_COLORS.field
  }, [])

  // Handle field node click - open config modal (Step 9)
  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: SchemaNode) => {
      if (node.data.nodeType === 'field') {
        const fieldData = node.data as FieldNodeData
        // Don't open modal for readonly fields
        if (!fieldData.isReadonly) {
          setSelectedField(fieldData)
        }
      }
    },
    []
  )

  // Save handler - calls PUT /api/admin/shopify/schema/field
  const handleSaveField = useCallback(
    async (formData: FieldMappingFormData) => {
      if (!selectedField) return

      const res = await fetch('/api/admin/shopify/schema/field', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullPath: selectedField.fullPath,
          enabled: formData.enabled,
          targetTable: formData.targetTable || null,
          targetColumn: formData.targetColumn || null,
          transformType: formData.transformType,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error?.message || 'Failed to save mapping')
      }

      // Refresh graph to show updated state
      await fetchGraph()
      setSelectedField(null)
    },
    [selectedField, fetchGraph]
  )

  return (
    <main className="p-6 md:p-10 bg-muted/30 min-h-screen">
      <div className="max-w-full mx-auto">
        <h2 className="text-4xl font-bold mb-6">Schema Graph</h2>

        {/* Loading State */}
        {loadState === 'loading' && (
          <div className="flex items-center justify-center h-96 border rounded-lg bg-white">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Loading schema graph...</span>
          </div>
        )}

        {/* Empty State */}
        {loadState === 'empty' && (
          <div className="flex flex-col items-center justify-center h-96 text-center border rounded-lg bg-white">
            <AlertCircle className="h-12 w-12 text-amber-500 mb-4" />
            <h3 className="text-lg font-semibold mb-2">Schema Cache Empty</h3>
            <p className="text-muted-foreground mb-4 max-w-md">
              {hint || 'Run introspection first to populate the schema cache.'}
            </p>
            <Link href="/admin/dev/shopify/config">
              <Button>Go to Config Page</Button>
            </Link>
          </div>
        )}

        {/* Error State */}
        {loadState === 'error' && (
          <div className="flex flex-col items-center justify-center h-96 text-center border rounded-lg bg-white">
            <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
            <h3 className="text-lg font-semibold mb-2">Failed to Load Graph</h3>
            <p className="text-muted-foreground mb-4">{error}</p>
            <Button onClick={() => fetchGraph()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        )}

        {/* Success State */}
        {loadState === 'success' && (
          <>
            {/* Stats Header */}
            <div className="flex items-center justify-between mb-4 px-1">
              <div className="flex gap-6 text-sm text-muted-foreground">
                <span>{stats?.entityCount} entities</span>
                <span>{stats?.fieldCount} fields</span>
                <span>
                  {visibleNodes.length} / {nodes.length} nodes visible
                </span>
                <span>{expandedEntities.size} expanded</span>
                <span className="text-xs">({stats?.durationMs}ms)</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchGraph()}
                disabled={isRefreshing}
              >
                {isRefreshing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                <span className="ml-2">Refresh</span>
              </Button>
            </div>

            {/* Graph */}
            <div
              className="border rounded-lg bg-white"
              style={{ height: 'calc(100vh - 280px)', minHeight: '500px' }}
            >
              <ReactFlow
                nodes={visibleNodes}
                edges={visibleEdges}
                nodeTypes={schemaNodeTypes}
                nodesDraggable={false}
                fitView
                onNodeClick={handleNodeClick}
              >
                <Background />
                <Controls />
                <MiniMap nodeColor={getMinimapNodeColor} />
              </ReactFlow>
            </div>

            {/* Field Configuration Modal (Step 9) */}
            <FieldConfigModal
              field={selectedField}
              open={selectedField !== null}
              onOpenChange={(open) => {
                if (!open) setSelectedField(null)
              }}
              onSave={handleSaveField}
            />
          </>
        )}
      </div>
    </main>
  )
}
