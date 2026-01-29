# Schema Graph Implementation: Steps 5-11

Detailed implementation plans derived from requirements in `/Users/danielplant/Desktop/cursor_shopify_sync_service_features.md`.

---

## Step 5: API Endpoint (GET)

### Overview

Create an API endpoint that returns the graph data structure for the frontend to render.

### 5.1 Endpoint Definition

```
GET /api/admin/shopify/schema
```

**Response**: `SchemaGraphData` (nodes, edges, metadata)

**Query Parameters**:
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `connectionId` | string | "default" | Tenant/connection identifier |
| `refresh` | boolean | false | Force re-build from cache |

### 5.2 File to Create

```
src/app/api/admin/shopify/schema/route.ts
```

### 5.3 Implementation

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { buildSchemaGraph } from '@/lib/shopify/schema-graph'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const connectionId = searchParams.get('connectionId') ?? 'default'

  try {
    const graphData = await buildSchemaGraph(connectionId)

    if (!graphData) {
      return NextResponse.json(
        {
          error: 'Schema cache is empty. Run introspection first.',
          code: 'CACHE_EMPTY'
        },
        { status: 404 }
      )
    }

    return NextResponse.json(graphData)
  } catch (error) {
    console.error('Failed to build schema graph:', error)
    return NextResponse.json(
      { error: 'Failed to build schema graph' },
      { status: 500 }
    )
  }
}
```

### 5.4 Response Shape

```typescript
{
  nodes: SchemaNode[],        // Entity nodes + field nodes
  edges: SchemaEdge[],        // Relationships
  entityCount: number,        // 6 known entities
  fieldCount: number,         // Total field nodes
  relationshipCount: number,  // Cross-entity relationships
  apiVersion: string,         // "2024-01"
  generatedAt: string         // ISO timestamp
}
```

### 5.5 Completion Checklist

- [ ] Create `src/app/api/admin/shopify/schema/route.ts`
- [ ] Import and call `buildSchemaGraph()`
- [ ] Handle empty cache case (404)
- [ ] Handle errors (500)
- [ ] Test: `curl http://localhost:3000/api/admin/shopify/schema`
- [ ] Verify response matches `SchemaGraphData` interface

---

## Step 6: Page Route

### Overview

Create the page at `/admin/dev/shopify/schema` that hosts the graph UI.

### 6.1 File Location

```
src/app/admin/(protected)/(dev)/dev/shopify/schema/page.tsx
```

Note: The file already exists as a stub. This step replaces it with the full implementation.

### 6.2 Implementation

```typescript
'use client'

import { useEffect, useState } from 'react'
import { ReactFlow, Background, Controls, MiniMap } from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { EntityNode } from '@/components/admin/schema-graph/EntityNode'
import { FieldNode } from '@/components/admin/schema-graph/FieldNode'
import { FieldConfigModal } from '@/components/admin/schema-graph/FieldConfigModal'
import type { SchemaGraphData, SchemaNode, FieldNodeData } from '@/lib/types/schema-graph'

// Register custom node types
const nodeTypes = {
  entity: EntityNode,
  field: FieldNode,
}

export default function SchemaGraphPage() {
  const [graphData, setGraphData] = useState<SchemaGraphData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedField, setSelectedField] = useState<FieldNodeData | null>(null)

  useEffect(() => {
    async function fetchGraph() {
      try {
        const res = await fetch('/api/admin/shopify/schema')
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Failed to fetch schema')
        }
        const data = await res.json()
        setGraphData(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }
    fetchGraph()
  }, [])

  const handleNodeClick = (_: React.MouseEvent, node: SchemaNode) => {
    if (node.data.nodeType === 'field') {
      setSelectedField(node.data as FieldNodeData)
    }
  }

  if (loading) {
    return (
      <main className="p-6 md:p-10 bg-muted/30 min-h-screen">
        <div className="flex items-center justify-center h-[600px]">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </main>
    )
  }

  if (error) {
    return (
      <main className="p-6 md:p-10 bg-muted/30 min-h-screen">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-bold mb-6">Schema Graph</h2>
          <div className="border rounded-lg p-6 bg-destructive/10 text-destructive">
            {error}
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="p-6 md:p-10 bg-muted/30 min-h-screen">
      <div className="max-w-full mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-4xl font-bold">Schema Graph</h2>
          <div className="text-sm text-muted-foreground">
            {graphData?.entityCount} entities · {graphData?.fieldCount} fields · {graphData?.relationshipCount} relationships
          </div>
        </div>

        <div style={{ width: '100%', height: 'calc(100vh - 200px)' }} className="border rounded-lg bg-white">
          <ReactFlow
            nodes={graphData?.nodes ?? []}
            edges={graphData?.edges ?? []}
            nodeTypes={nodeTypes}
            onNodeClick={handleNodeClick}
            fitView
            fitViewOptions={{ padding: 0.2 }}
          >
            <Background />
            <Controls />
            <MiniMap />
          </ReactFlow>
        </div>

        {selectedField && (
          <FieldConfigModal
            field={selectedField}
            onClose={() => setSelectedField(null)}
            onSave={async (mapping) => {
              // Step 10-11: Save to API
              await fetch('/api/admin/shopify/schema/field', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(mapping),
              })
              setSelectedField(null)
            }}
          />
        )}
      </div>
    </main>
  )
}
```

### 6.3 Completion Checklist

- [ ] Replace stub page with full implementation
- [ ] Import custom node types (Step 7)
- [ ] Fetch data from API on mount
- [ ] Handle loading and error states
- [ ] Wire `onNodeClick` to open modal
- [ ] Test: Navigate to `/admin/dev/shopify/schema`

---

## Step 7: Entity + Field Node Components

### Overview

Create custom React Flow node components for entities and fields. These are React components that receive node data and render the visual representation.

### 7.1 Files to Create

```
src/components/admin/schema-graph/
├── EntityNode.tsx
├── FieldNode.tsx
├── index.ts
└── node-styles.ts (shared styles)
```

### 7.2 EntityNode Component

**Purpose**: Render entity nodes (Product, ProductVariant, etc.) as header/grouping nodes.

```typescript
// src/components/admin/schema-graph/EntityNode.tsx
import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { EntityNodeData } from '@/lib/types/schema-graph'
import { cn } from '@/lib/utils'

export const EntityNode = memo(function EntityNode({
  data
}: NodeProps<EntityNodeData>) {
  return (
    <div className={cn(
      'px-4 py-3 rounded-lg border-2 shadow-md min-w-[180px]',
      'bg-primary text-primary-foreground border-primary'
    )}>
      {/* Connection handles */}
      <Handle type="source" position={Position.Bottom} className="!bg-primary" />
      <Handle type="target" position={Position.Top} className="!bg-primary" />

      {/* Content */}
      <div className="text-center">
        <div className="font-semibold text-base">{data.displayName}</div>
        <div className="text-xs opacity-80 mt-1">
          {data.fieldCount} fields
        </div>
      </div>
    </div>
  )
})
```

### 7.3 FieldNode Component

**Purpose**: Render field nodes with visual encoding of status and type.

**Visual Requirements** (from source doc):
- Show field name prominently
- Type badge (String, Money, Connection, etc.)
- Status indicators: enabled (●), disabled (○), protected (lock)
- Relationship indicator for fields that point to other entities
- Readonly styling for connection/polymorphic fields
- Click target for opening config modal

```typescript
// src/components/admin/schema-graph/FieldNode.tsx
import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Lock, Link2, ChevronRight } from 'lucide-react'
import type { FieldNodeData } from '@/lib/types/schema-graph'
import { cn } from '@/lib/utils'

// Category → color mapping
const CATEGORY_COLORS: Record<string, string> = {
  system: 'border-blue-500 bg-blue-50',
  timestamp: 'border-purple-500 bg-purple-50',
  scalar: 'border-gray-400 bg-white',
  enum: 'border-amber-500 bg-amber-50',
  object: 'border-green-500 bg-green-50',
  connection: 'border-cyan-500 bg-cyan-50',
  polymorphic: 'border-pink-500 bg-pink-50',
  count: 'border-orange-500 bg-orange-50',
}

export const FieldNode = memo(function FieldNode({
  data
}: NodeProps<FieldNodeData>) {
  const colorClass = CATEGORY_COLORS[data.category] ?? 'border-gray-300 bg-white'

  return (
    <div
      className={cn(
        'px-3 py-2 rounded-md border-2 shadow-sm min-w-[160px] cursor-pointer',
        'hover:shadow-md transition-shadow',
        colorClass,
        data.isReadonly && 'opacity-60 cursor-not-allowed',
        data.isEnabled && 'ring-2 ring-green-500 ring-offset-1',
        data.isDeprecated && 'line-through opacity-50'
      )}
    >
      {/* Connection handles */}
      <Handle type="target" position={Position.Top} className="!bg-gray-400" />
      <Handle type="source" position={Position.Bottom} className="!bg-gray-400" />
      {data.isRelationship && (
        <Handle type="source" position={Position.Right} className="!bg-blue-500" />
      )}

      {/* Content */}
      <div className="flex items-center gap-2">
        {/* Enable indicator */}
        <span className={cn(
          'w-2 h-2 rounded-full',
          data.isEnabled ? 'bg-green-500' : 'bg-gray-300'
        )} />

        {/* Field name */}
        <span className="font-medium text-sm flex-1 truncate">
          .{data.fieldName}
        </span>

        {/* Icons */}
        <div className="flex items-center gap-1">
          {data.isProtected && (
            <Lock className="h-3 w-3 text-muted-foreground" />
          )}
          {data.isRelationship && (
            <Link2 className="h-3 w-3 text-blue-500" />
          )}
          {data.kind === 'OBJECT' && !data.isRelationship && (
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Type badge */}
      <div className="flex items-center gap-2 mt-1">
        <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
          {data.baseType}
        </span>
        {data.isMapped && (
          <span className="text-xs text-green-600">
            → {data.mapping?.targetColumn}
          </span>
        )}
      </div>

      {/* Description (truncated) */}
      {data.description && (
        <p className="text-xs text-muted-foreground mt-1 truncate max-w-[200px]">
          {data.description}
        </p>
      )}
    </div>
  )
})
```

### 7.4 Index Export

```typescript
// src/components/admin/schema-graph/index.ts
export { EntityNode } from './EntityNode'
export { FieldNode } from './FieldNode'
export { FieldConfigModal } from './FieldConfigModal'
```

### 7.5 Completion Checklist

- [ ] Create `EntityNode.tsx` with handles and styling
- [ ] Create `FieldNode.tsx` with status indicators
- [ ] Add category-based color coding
- [ ] Add enabled/disabled visual state
- [ ] Add relationship indicator (Link2 icon)
- [ ] Add protected indicator (Lock icon)
- [ ] Add mapped column display
- [ ] Create index.ts exports
- [ ] Test: Nodes render correctly in graph

---

## Step 8: Visual Milestone

### Overview

This is not a code step. This is the checkpoint where the graph renders real data on screen.

### 8.1 What Should Work

At this point:
1. Navigate to `/admin/dev/shopify/schema`
2. Page fetches from `GET /api/admin/shopify/schema`
3. React Flow renders with:
   - Entity nodes (Product, ProductVariant, etc.) as headers
   - Field nodes under each entity
   - Edges connecting entities to their fields
   - Edges connecting relationship fields to target entities (animated, blue)
   - Subfield edges (dashed) for object type expansions

### 8.2 Expected Visual

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│     Product     │     │ ProductVariant  │     │  InventoryItem  │
│    (header)     │     │    (header)     │     │    (header)     │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
    ┌────┴────┐             ┌────┴────┐             ┌────┴────┐
    │         │             │         │             │         │
┌───┴───┐ ┌───┴───┐    ┌───┴───┐ ┌───┴───┐    ┌───┴───┐ ┌───┴───┐
│.title │ │.status│    │ .sku  │ │.price │    │ .sku  │ │.tracked│
│String │ │ Enum  │    │String │ │ Money │    │String │ │Boolean │
│ [●]   │ │  [●]  │    │  [●]  │ │  [●]  │    │  [○]  │ │  [●]   │
└───────┘ └───────┘    └───────┘ └───┬───┘    └───────┘ └────────┘
                                     │
                               ┌─────┴─────┐
                               │           │
                          ┌────┴────┐ ┌────┴────┐
                          │.amount  │ │.currency│
                          │Decimal  │ │  Enum   │
                          │  [●]    │ │   [○]   │
                          └─────────┘ └─────────┘
```

### 8.3 Verification Checklist

- [ ] Page loads without errors
- [ ] Entities appear as distinct header nodes
- [ ] Fields appear as child nodes below entities
- [ ] Color coding matches field categories
- [ ] Enabled fields show green indicator
- [ ] Protected fields show lock icon
- [ ] Relationship fields show link icon
- [ ] Object subfields are indented/connected with dashed edges
- [ ] Zoom/pan controls work
- [ ] Minimap displays graph overview
- [ ] Clicking a field node logs to console (before modal is wired)

---

## Step 9: Config Modal

### Overview

Create the modal that opens when a field node is clicked. This is where users configure the field mapping.

### 9.1 File to Create

```
src/components/admin/schema-graph/FieldConfigModal.tsx
```

### 9.2 Modal Content Requirements

From the source document, when configuring a field, users need to set:

| Section | Fields | Description |
|---------|--------|-------------|
| **Field Info** (readonly) | fieldPath, fullPath, baseType, category, description | Context about what's being configured |
| **Enable/Disable** | enabled toggle | Include this field in sync |
| **Target Mapping** | targetTable, targetColumn | Where to write in SQL |
| **Transform** | transformType, transformConfig | How to transform the value |
| **Status** (readonly) | accessStatus, isProtected | Access verification results |

### 9.3 Implementation

```typescript
// src/components/admin/schema-graph/FieldConfigModal.tsx
'use client'

import { useState } from 'react'
import { X, Save, Lock, AlertTriangle, CheckCircle2 } from 'lucide-react'
import type { FieldNodeData, FieldMapping } from '@/lib/types/schema-graph'
import { cn } from '@/lib/utils'

interface FieldConfigModalProps {
  field: FieldNodeData
  onClose: () => void
  onSave: (mapping: Partial<FieldMapping>) => Promise<void>
}

const TRANSFORM_TYPES = [
  { value: 'direct', label: 'Direct (no transform)' },
  { value: 'parseFloat', label: 'Parse as Float' },
  { value: 'parseInt', label: 'Parse as Integer' },
  { value: 'lookup', label: 'Lookup Table' },
  { value: 'custom', label: 'Custom Expression' },
]

// Known target tables from the codebase
const TARGET_TABLES = [
  'Sku',
  'RawSkusFromShopify',
  'ProductVariant',
  'InventoryItem',
]

export function FieldConfigModal({ field, onClose, onSave }: FieldConfigModalProps) {
  const [enabled, setEnabled] = useState(field.isEnabled)
  const [targetTable, setTargetTable] = useState(field.mapping?.targetTable ?? '')
  const [targetColumn, setTargetColumn] = useState(field.mapping?.targetColumn ?? '')
  const [transformType, setTransformType] = useState(field.mapping?.transformType ?? 'direct')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave({
        entityType: field.parentEntity,
        fieldPath: field.fieldPath,
        fullPath: field.fullPath,
        depth: field.depth,
        enabled,
        targetTable: targetTable || null,
        targetColumn: targetColumn || null,
        transformType: transformType as FieldMapping['transformType'],
        isProtected: field.isProtected,
        accessStatus: 'untested', // Will be set by access probe
      })
    } finally {
      setSaving(false)
    }
  }

  const isReadonly = field.isReadonly || field.isProtected

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h3 className="font-semibold text-lg">Configure Field</h3>
            <p className="text-sm text-muted-foreground font-mono">
              {field.fullPath}
            </p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-6">
          {/* Field Info Section */}
          <section>
            <h4 className="font-medium text-sm text-muted-foreground mb-2">Field Info</h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">Type:</span>
                <span className="ml-2 font-mono">{field.baseType}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Kind:</span>
                <span className="ml-2">{field.kind}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Category:</span>
                <span className="ml-2">{field.category}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Depth:</span>
                <span className="ml-2">{field.depth}</span>
              </div>
            </div>
            {field.description && (
              <p className="mt-2 text-sm text-muted-foreground">
                {field.description}
              </p>
            )}
          </section>

          {/* Status Badges */}
          <section className="flex gap-2">
            {field.isProtected && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-amber-100 text-amber-800">
                <Lock className="h-3 w-3" /> Protected
              </span>
            )}
            {field.isRelationship && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-blue-100 text-blue-800">
                → {field.targetEntity}
              </span>
            )}
            {field.isDeprecated && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-red-100 text-red-800">
                <AlertTriangle className="h-3 w-3" /> Deprecated
              </span>
            )}
            {field.isReadonly && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-gray-100 text-gray-600">
                Read-only
              </span>
            )}
          </section>

          {/* Enable Toggle */}
          {!isReadonly && (
            <section>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <span className="font-medium">Include in sync</span>
              </label>
            </section>
          )}

          {/* Target Mapping */}
          {!isReadonly && enabled && (
            <section>
              <h4 className="font-medium text-sm text-muted-foreground mb-2">Target Mapping</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm mb-1">Table</label>
                  <select
                    value={targetTable}
                    onChange={(e) => setTargetTable(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md text-sm"
                  >
                    <option value="">Select table...</option>
                    {TARGET_TABLES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm mb-1">Column</label>
                  <input
                    type="text"
                    value={targetColumn}
                    onChange={(e) => setTargetColumn(e.target.value)}
                    placeholder="e.g., Price"
                    className="w-full px-3 py-2 border rounded-md text-sm"
                  />
                </div>
              </div>
            </section>
          )}

          {/* Transform */}
          {!isReadonly && enabled && targetColumn && (
            <section>
              <h4 className="font-medium text-sm text-muted-foreground mb-2">Transform</h4>
              <select
                value={transformType}
                onChange={(e) => setTransformType(e.target.value)}
                className="w-full px-3 py-2 border rounded-md text-sm"
              >
                {TRANSFORM_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-4 border-t bg-muted/30">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-md border hover:bg-muted"
          >
            Cancel
          </button>
          {!isReadonly && (
            <button
              onClick={handleSave}
              disabled={saving}
              className={cn(
                'px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground',
                'hover:bg-primary/90 disabled:opacity-50'
              )}
            >
              {saving ? 'Saving...' : 'Save Configuration'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
```

### 9.4 Completion Checklist

- [ ] Create `FieldConfigModal.tsx`
- [ ] Display field info (readonly section)
- [ ] Display status badges (protected, relationship, deprecated)
- [ ] Add enable/disable toggle
- [ ] Add target table dropdown
- [ ] Add target column input
- [ ] Add transform type selector
- [ ] Disable editing for readonly/protected fields
- [ ] Wire onSave callback
- [ ] Test: Click field node → modal opens with correct data

---

## Step 10: API Endpoint (POST/PATCH)

### Overview

Create the API endpoint for saving field configuration to the `ShopifyFieldMapping` table.

### 10.1 Endpoint Definition

```
POST /api/admin/shopify/schema/field
```

**Request Body**: `Partial<FieldMapping>`

**Response**: `FieldMapping` (the created/updated record)

### 10.2 File to Create

```
src/app/api/admin/shopify/schema/field/route.ts
```

### 10.3 Implementation

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

interface FieldMappingInput {
  connectionId?: string
  entityType: string
  fieldPath: string
  fullPath: string
  depth: number
  enabled: boolean
  targetTable: string | null
  targetColumn: string | null
  transformType: string
  transformConfig?: Record<string, unknown>
  isProtected: boolean
  accessStatus: string
}

export async function POST(request: NextRequest) {
  try {
    const body: FieldMappingInput = await request.json()
    const connectionId = body.connectionId ?? 'default'

    // Validate required fields
    if (!body.entityType || !body.fieldPath || !body.fullPath) {
      return NextResponse.json(
        { error: 'Missing required fields: entityType, fieldPath, fullPath' },
        { status: 400 }
      )
    }

    // Validate fullPath consistency
    const expectedFullPath = `${body.entityType}.${body.fieldPath}`
    if (body.fullPath !== expectedFullPath) {
      return NextResponse.json(
        { error: `fullPath must equal entityType.fieldPath (expected: ${expectedFullPath})` },
        { status: 400 }
      )
    }

    // Upsert the mapping
    const mapping = await prisma.shopifyFieldMapping.upsert({
      where: {
        connectionId_entityType_fieldPath: {
          connectionId,
          entityType: body.entityType,
          fieldPath: body.fieldPath,
        },
      },
      create: {
        connectionId,
        entityType: body.entityType,
        fieldPath: body.fieldPath,
        fullPath: body.fullPath,
        depth: body.depth,
        enabled: body.enabled,
        targetTable: body.targetTable,
        targetColumn: body.targetColumn,
        transformType: body.transformType ?? 'direct',
        transformConfig: body.transformConfig ? JSON.stringify(body.transformConfig) : null,
        isProtected: body.isProtected,
        accessStatus: body.accessStatus ?? 'untested',
      },
      update: {
        enabled: body.enabled,
        targetTable: body.targetTable,
        targetColumn: body.targetColumn,
        transformType: body.transformType ?? 'direct',
        transformConfig: body.transformConfig ? JSON.stringify(body.transformConfig) : null,
        accessStatus: body.accessStatus ?? 'untested',
        // Don't update: depth, isProtected, fullPath (immutable)
      },
    })

    return NextResponse.json({
      id: String(mapping.id),
      entityType: mapping.entityType,
      fieldPath: mapping.fieldPath,
      fullPath: mapping.fullPath,
      depth: mapping.depth,
      targetTable: mapping.targetTable,
      targetColumn: mapping.targetColumn,
      transformType: mapping.transformType,
      transformConfig: mapping.transformConfig ? JSON.parse(mapping.transformConfig) : undefined,
      enabled: mapping.enabled,
      isProtected: mapping.isProtected,
      accessStatus: mapping.accessStatus,
    })
  } catch (error) {
    console.error('Failed to save field mapping:', error)
    return NextResponse.json(
      { error: 'Failed to save field mapping' },
      { status: 500 }
    )
  }
}
```

### 10.4 Completion Checklist

- [ ] Create `src/app/api/admin/shopify/schema/field/route.ts`
- [ ] Validate required fields
- [ ] Validate fullPath consistency
- [ ] Upsert to `ShopifyFieldMapping` table
- [ ] Return the saved mapping
- [ ] Handle errors
- [ ] Test: POST with valid body → creates/updates record

---

## Step 11: Wire Modal to Persistence

### Overview

Connect the modal save action to the API endpoint and update the graph state.

### 11.1 Changes Required

The page component (Step 6) already has the basic wiring. This step adds:

1. **Optimistic UI update**: Update the node visually before API confirms
2. **Refetch graph data**: After save, refresh to get updated mapping state
3. **Error handling**: Show toast/error if save fails
4. **Success feedback**: Visual confirmation of save

### 11.2 Enhanced Page Implementation

```typescript
// Add to SchemaGraphPage (Step 6)

import { useCallback } from 'react'

// Inside the component:
const [nodes, setNodes] = useState<SchemaNode[]>([])

// Update node data after save
const updateNodeMapping = useCallback((fullPath: string, mapping: Partial<FieldMapping>) => {
  setNodes((prev) =>
    prev.map((node) => {
      if (node.data.nodeType === 'field' && (node.data as FieldNodeData).fullPath === fullPath) {
        return {
          ...node,
          data: {
            ...node.data,
            isEnabled: mapping.enabled ?? (node.data as FieldNodeData).isEnabled,
            isMapped: !!mapping.targetColumn,
            mapping: { ...(node.data as FieldNodeData).mapping, ...mapping } as FieldMapping,
          },
        }
      }
      return node
    })
  )
}, [])

// Enhanced save handler
const handleSave = async (mapping: Partial<FieldMapping>) => {
  // Optimistic update
  updateNodeMapping(mapping.fullPath!, mapping)

  try {
    const res = await fetch('/api/admin/shopify/schema/field', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mapping),
    })

    if (!res.ok) {
      throw new Error('Failed to save')
    }

    // Success - close modal
    setSelectedField(null)

    // Optional: Show success toast
    // toast.success('Field configuration saved')
  } catch (error) {
    // Revert optimistic update by refetching
    const res = await fetch('/api/admin/shopify/schema')
    const data = await res.json()
    setNodes(data.nodes)

    // Show error
    // toast.error('Failed to save field configuration')
  }
}
```

### 11.3 Complete Flow

```
User clicks field node
       ↓
Modal opens with field data
       ↓
User configures: enabled, targetTable, targetColumn, transform
       ↓
User clicks "Save Configuration"
       ↓
Optimistic UI update (node shows new state immediately)
       ↓
POST /api/admin/shopify/schema/field
       ↓
┌─────────────┬──────────────────────────┐
│   Success   │         Failure          │
├─────────────┼──────────────────────────┤
│ Close modal │ Revert to previous state │
│ Show toast  │ Show error message       │
└─────────────┴──────────────────────────┘
```

### 11.4 Completion Checklist

- [ ] Add `updateNodeMapping` function for optimistic updates
- [ ] Update node state immediately on save
- [ ] Call POST endpoint
- [ ] Handle success: close modal
- [ ] Handle failure: revert state, show error
- [ ] Test: Save configuration → node updates → persists to DB
- [ ] Test: Network failure → node reverts → error shown

---

## Summary: Files to Create

| Step | File | Purpose |
|------|------|---------|
| 5 | `src/app/api/admin/shopify/schema/route.ts` | GET graph data |
| 6 | `src/app/admin/(protected)/(dev)/dev/shopify/schema/page.tsx` | Page (replace stub) |
| 7 | `src/components/admin/schema-graph/EntityNode.tsx` | Entity node component |
| 7 | `src/components/admin/schema-graph/FieldNode.tsx` | Field node component |
| 7 | `src/components/admin/schema-graph/index.ts` | Exports |
| 9 | `src/components/admin/schema-graph/FieldConfigModal.tsx` | Configuration modal |
| 10 | `src/app/api/admin/shopify/schema/field/route.ts` | POST field config |

---

## Dependencies

Steps must be completed in order:
- Step 5 → Step 6 (page needs API)
- Step 7 → Step 6 (page needs node components)
- Step 6 + Step 7 → Step 8 (visual milestone)
- Step 8 → Step 9 (modal needs working graph)
- Step 9 → Step 10 (API needs modal to call it)
- Step 10 → Step 11 (wiring needs API)
