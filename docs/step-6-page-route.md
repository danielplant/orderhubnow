# Step 6: Page Route - Detailed Implementation Plan

## Overview

Replace the existing stub page at `/admin/dev/shopify/schema` with a fully functional page that:
1. Fetches graph data from the API (Step 5)
2. Renders React Flow with custom node types (Step 7)
3. Handles loading, error, and empty states
4. Wires click events for field configuration (Step 9)

---

## 6.1 File Location

```
src/app/admin/(protected)/(dev)/dev/shopify/schema/page.tsx
```

**Current state**: Stub with test node (25 lines)
**Target state**: Full implementation (~200 lines)

---

## 6.2 Prerequisites

| Dependency | Location | Status |
|------------|----------|--------|
| Step 5 API endpoint | `src/app/api/admin/shopify/schema/route.ts` | Must be complete |
| Step 7 Node components | `src/components/admin/schema-graph/` | Created in parallel |
| React Flow installed | `@xyflow/react` in package.json | ✅ Already installed |
| Type definitions | `src/lib/types/schema-graph.ts` | ✅ Already exists |

**Note**: Steps 6 and 7 can be developed in parallel. The page can use default nodes initially and switch to custom nodes once Step 7 is complete.

---

## 6.3 Page Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Header                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  Schema Graph                                 6 entities · 580 fields   ││
│  │  Interactive field-level schema visualization                           ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  Graph Container (full viewport height minus header)                         │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                                                                          ││
│  │   [Entity Nodes]  ←──→  [Field Nodes]  ←──→  [Related Entities]         ││
│  │                                                                          ││
│  │   ┌─────────────┐        ┌─────────────┐                                ││
│  │   │  Controls   │        │   MiniMap   │                                ││
│  │   └─────────────┘        └─────────────┘                                ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  [FieldConfigModal - overlay when field is selected]                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6.4 State Management

```typescript
interface PageState {
  // Data
  graphData: SchemaGraphData | null

  // UI states
  loading: boolean
  error: string | null

  // Selection
  selectedField: FieldNodeData | null

  // React Flow controlled state (optional, for advanced features)
  // nodes: SchemaNode[]  // If we need to update nodes after save
  // edges: SchemaEdge[]
}
```

---

## 6.5 Implementation

### 6.5.1 Imports Section

```typescript
'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type NodeMouseHandler,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { EntityNode } from '@/components/admin/schema-graph/EntityNode'
import { FieldNode } from '@/components/admin/schema-graph/FieldNode'
import { FieldConfigModal } from '@/components/admin/schema-graph/FieldConfigModal'
import type {
  SchemaGraphData,
  SchemaNode,
  SchemaEdge,
  FieldNodeData,
  FieldMapping,
} from '@/lib/types/schema-graph'
```

### 6.5.2 Node Types Registration

```typescript
// Register custom node types - must be outside component to avoid re-registration
const nodeTypes = {
  entity: EntityNode,
  field: FieldNode,
}
```

### 6.5.3 Main Component

```typescript
export default function SchemaGraphPage() {
  // ─────────────────────────────────────────────────────────────────────────
  // State
  // ─────────────────────────────────────────────────────────────────────────
  const [graphData, setGraphData] = useState<SchemaGraphData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedField, setSelectedField] = useState<FieldNodeData | null>(null)

  // React Flow controlled state for node updates after save
  const [nodes, setNodes, onNodesChange] = useNodesState<SchemaNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<SchemaEdge>([])

  // ─────────────────────────────────────────────────────────────────────────
  // Data Fetching
  // ─────────────────────────────────────────────────────────────────────────
  const fetchGraph = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/admin/shopify/schema')
      const data = await res.json()

      if (!res.ok) {
        // Handle known error codes
        if (data.code === 'CACHE_EMPTY') {
          setError('Schema cache is empty. Visit the Config page to run introspection first.')
        } else {
          setError(data.error || 'Failed to load schema')
        }
        return
      }

      setGraphData(data)
      setNodes(data.nodes)
      setEdges(data.edges)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load schema')
    } finally {
      setLoading(false)
    }
  }, [setNodes, setEdges])

  useEffect(() => {
    fetchGraph()
  }, [fetchGraph])

  // ─────────────────────────────────────────────────────────────────────────
  // Event Handlers
  // ─────────────────────────────────────────────────────────────────────────
  const handleNodeClick: NodeMouseHandler<SchemaNode> = useCallback(
    (event, node) => {
      // Only handle field nodes, not entity nodes
      if (node.data.nodeType === 'field') {
        const fieldData = node.data as FieldNodeData

        // Don't open modal for readonly fields (connections, polymorphic)
        if (fieldData.isReadonly) {
          return
        }

        setSelectedField(fieldData)
      }
    },
    []
  )

  const handleModalClose = useCallback(() => {
    setSelectedField(null)
  }, [])

  const handleFieldSave = useCallback(
    async (mapping: Partial<FieldMapping>) => {
      // Step 10-11: Save to API and update node state
      try {
        const res = await fetch('/api/admin/shopify/schema/field', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(mapping),
        })

        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Failed to save')
        }

        // Optimistic update: Update the node in local state
        setNodes((prevNodes) =>
          prevNodes.map((node) => {
            if (
              node.data.nodeType === 'field' &&
              (node.data as FieldNodeData).fullPath === mapping.fullPath
            ) {
              return {
                ...node,
                data: {
                  ...node.data,
                  isEnabled: mapping.enabled ?? (node.data as FieldNodeData).isEnabled,
                  isMapped: !!mapping.targetColumn,
                  mapping: {
                    ...(node.data as FieldNodeData).mapping,
                    ...mapping,
                  } as FieldMapping,
                },
              }
            }
            return node
          })
        )

        setSelectedField(null)
      } catch (err) {
        // Show error but don't close modal
        console.error('Failed to save field mapping:', err)
        alert(err instanceof Error ? err.message : 'Failed to save')
      }
    },
    [setNodes]
  )

  // ─────────────────────────────────────────────────────────────────────────
  // Render: Loading State
  // ─────────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <main className="p-6 md:p-10 bg-muted/30 min-h-screen">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-bold mb-6">Schema Graph</h2>
          <div className="flex items-center justify-center h-[600px] border rounded-lg bg-white">
            <div className="flex flex-col items-center gap-4">
              <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
              <p className="text-muted-foreground">Loading schema...</p>
            </div>
          </div>
        </div>
      </main>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render: Error State
  // ─────────────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <main className="p-6 md:p-10 bg-muted/30 min-h-screen">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-bold mb-6">Schema Graph</h2>
          <div className="border rounded-lg p-8 bg-white">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <span className="text-2xl">⚠️</span>
              </div>
              <div>
                <h3 className="font-semibold text-lg">Unable to load schema</h3>
                <p className="text-muted-foreground mt-1 max-w-md">{error}</p>
              </div>
              <div className="flex gap-3 mt-4">
                <button
                  onClick={fetchGraph}
                  className="px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  Retry
                </button>
                <a
                  href="/admin/dev/shopify/config"
                  className="px-4 py-2 text-sm font-medium rounded-md border hover:bg-muted"
                >
                  Go to Config
                </a>
              </div>
            </div>
          </div>
        </div>
      </main>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render: Graph
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <main className="p-6 md:p-10 bg-muted/30 min-h-screen">
      <div className="max-w-full mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-4xl font-bold">Schema Graph</h2>
            <p className="text-muted-foreground mt-1">
              Interactive field-level schema visualization
            </p>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>{graphData?.entityCount} entities</span>
            <span>·</span>
            <span>{graphData?.fieldCount} fields</span>
            <span>·</span>
            <span>{graphData?.relationshipCount} relationships</span>
            {graphData?._meta?.durationMs && (
              <>
                <span>·</span>
                <span className="font-mono text-xs">{graphData._meta.durationMs}ms</span>
              </>
            )}
          </div>
        </div>

        {/* Graph Container */}
        <div
          style={{ width: '100%', height: 'calc(100vh - 200px)' }}
          className="border rounded-lg bg-white"
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            onNodeClick={handleNodeClick}
            fitView
            fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
            minZoom={0.1}
            maxZoom={2}
            defaultEdgeOptions={{
              type: 'smoothstep',
              animated: false,
            }}
          >
            <Background color="#f0f0f0" gap={16} />
            <Controls showInteractive={false} />
            <MiniMap
              nodeColor={(node) => {
                if (node.data?.nodeType === 'entity') return '#3b82f6'
                if ((node.data as FieldNodeData)?.isEnabled) return '#22c55e'
                return '#d1d5db'
              }}
              maskColor="rgba(0, 0, 0, 0.1)"
            />
          </ReactFlow>
        </div>

        {/* Field Config Modal */}
        {selectedField && (
          <FieldConfigModal
            field={selectedField}
            onClose={handleModalClose}
            onSave={handleFieldSave}
          />
        )}
      </div>
    </main>
  )
}
```

---

## 6.6 TypeScript Interface Extension

The API response includes `_meta` which isn't in the base type. Add to the component:

```typescript
// Extend the API response type locally
interface SchemaGraphResponse extends SchemaGraphData {
  success: boolean
  _meta?: { durationMs: number }
}
```

Or update the fetch handling to type it properly.

---

## 6.7 Fallback for Missing Node Components

If Step 7 is not complete, the page will error because `EntityNode` and `FieldNode` don't exist. Create placeholder components:

```typescript
// Temporary: src/components/admin/schema-graph/EntityNode.tsx
import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'

export const EntityNode = memo(function EntityNode({ data }: NodeProps) {
  return (
    <div className="px-4 py-3 rounded-lg border-2 bg-blue-500 text-white min-w-[150px]">
      <Handle type="source" position={Position.Bottom} />
      <Handle type="target" position={Position.Top} />
      <div className="font-semibold">{data.displayName ?? data.entityName}</div>
    </div>
  )
})

// Temporary: src/components/admin/schema-graph/FieldNode.tsx
import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'

export const FieldNode = memo(function FieldNode({ data }: NodeProps) {
  return (
    <div className="px-3 py-2 rounded border bg-white min-w-[140px]">
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
      <div className="text-sm font-medium">.{data.fieldName}</div>
      <div className="text-xs text-gray-500">{data.baseType}</div>
    </div>
  )
})

// Temporary: src/components/admin/schema-graph/FieldConfigModal.tsx
export function FieldConfigModal({ field, onClose, onSave }: any) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md">
        <h3 className="font-semibold mb-4">Configure: {field.fullPath}</h3>
        <p className="text-sm text-gray-500 mb-4">Modal implementation pending (Step 9)</p>
        <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded">Close</button>
      </div>
    </div>
  )
}

// src/components/admin/schema-graph/index.ts
export { EntityNode } from './EntityNode'
export { FieldNode } from './FieldNode'
export { FieldConfigModal } from './FieldConfigModal'
```

---

## 6.8 Directory Structure

After Step 6 (and placeholder components):

```
src/
├── app/admin/(protected)/(dev)/dev/shopify/schema/
│   └── page.tsx                    ← REPLACE (this step)
│
├── components/admin/schema-graph/
│   ├── EntityNode.tsx              ← CREATE (placeholder or Step 7)
│   ├── FieldNode.tsx               ← CREATE (placeholder or Step 7)
│   ├── FieldConfigModal.tsx        ← CREATE (placeholder or Step 9)
│   └── index.ts                    ← CREATE
│
└── lib/types/
    └── schema-graph.ts             ← EXISTS
```

---

## 6.9 Step-by-Step Instructions

### 6.9.1 Create Component Directory

```bash
mkdir -p src/components/admin/schema-graph
```

### 6.9.2 Create Placeholder Components

Create the three placeholder files from Section 6.7 so the page can render.

### 6.9.3 Replace Page Implementation

Replace the contents of `src/app/admin/(protected)/(dev)/dev/shopify/schema/page.tsx` with the code from Section 6.5.

### 6.9.4 Verify TypeScript

```bash
npm run type-check
```

Fix any import or type errors.

### 6.9.5 Test in Browser

1. Start dev server: `npm run dev`
2. Log in as admin
3. Navigate to: `http://localhost:3000/admin/dev/shopify/schema`
4. Verify:
   - Loading spinner appears briefly
   - Graph renders with nodes
   - Zoom/pan works
   - MiniMap shows overview
   - Clicking a field node opens placeholder modal

---

## 6.10 React Flow Configuration Notes

### 6.10.1 Performance Settings

```typescript
<ReactFlow
  // ... other props
  minZoom={0.1}           // Allow zooming out to see full graph
  maxZoom={2}             // Limit zoom in
  fitView                 // Auto-fit on load
  fitViewOptions={{
    padding: 0.2,         // Add padding around graph
    maxZoom: 1            // Don't zoom in when fitting
  }}
/>
```

### 6.10.2 Node Types Must Be Stable

```typescript
// ✅ CORRECT: Outside component
const nodeTypes = { entity: EntityNode, field: FieldNode }

// ❌ WRONG: Inside component (causes re-registration on every render)
export default function Page() {
  const nodeTypes = { entity: EntityNode, field: FieldNode } // BAD
}
```

### 6.10.3 Controlled vs Uncontrolled

The implementation uses **controlled mode** with `useNodesState` and `useEdgesState` because:
- We need to update nodes after saving a field configuration
- We want smooth transitions when data changes

If you don't need to update nodes, you can use **uncontrolled mode**:
```typescript
<ReactFlow nodes={graphData.nodes} edges={graphData.edges} />
```

---

## 6.11 Testing Checklist

### Basic Functionality
- [ ] Page loads without errors
- [ ] Loading state shows spinner
- [ ] Error state shows message and retry button
- [ ] Empty cache shows specific error with link to Config page

### Graph Rendering
- [ ] Entity nodes render (blue headers)
- [ ] Field nodes render (smaller nodes under entities)
- [ ] Edges connect entities to their fields
- [ ] Relationship edges are animated (blue)
- [ ] Subfield edges are dashed

### Interaction
- [ ] Zoom in/out works (scroll wheel)
- [ ] Pan works (drag background)
- [ ] Controls panel visible (bottom-left)
- [ ] MiniMap visible (bottom-right)
- [ ] MiniMap shows correct colors (entity=blue, enabled=green, disabled=gray)

### Click Handling
- [ ] Clicking entity node does nothing (intentional)
- [ ] Clicking field node opens modal
- [ ] Clicking readonly field (connection/polymorphic) does nothing
- [ ] Modal shows field fullPath
- [ ] Modal close button works

### Header
- [ ] Title displays "Schema Graph"
- [ ] Stats show entity count, field count, relationship count
- [ ] Duration shows (if _meta.durationMs present)

---

## 6.12 Potential Issues & Solutions

| Issue | Symptom | Solution |
|-------|---------|----------|
| **Blank graph** | No nodes visible | Check if `nodes` array is empty. Verify API response in Network tab. |
| **Import errors** | "Cannot find module" | Create the placeholder components first (Section 6.7) |
| **Type errors** | TypeScript complaints | Ensure `SchemaNode` and `SchemaEdge` types match React Flow's expectations |
| **Nodes overlap** | All nodes at same position | The `buildSchemaGraph` function calculates positions. Check `position` in nodes. |
| **No edges** | Nodes render but not connected | Verify `edges` array in API response. Check edge `source` and `target` match node `id`s. |
| **Modal doesn't open** | Click does nothing | Check console for errors. Verify `onNodeClick` is wired correctly. |
| **Graph doesn't fit** | Need to scroll to see | Verify `fitView` prop is set. Check container has proper height. |

---

## 6.13 Completion Checklist

- [ ] Directory created: `src/components/admin/schema-graph/`
- [ ] Placeholder components created (EntityNode, FieldNode, FieldConfigModal, index.ts)
- [ ] Page replaced with full implementation
- [ ] `npm run type-check` passes
- [ ] Dev server starts without errors
- [ ] Loading state renders
- [ ] Error state renders (test by stopping API)
- [ ] Graph renders with nodes and edges
- [ ] Zoom/pan works
- [ ] MiniMap works
- [ ] Click on field node opens modal
- [ ] Click on entity node does nothing
- [ ] Click on readonly field does nothing
- [ ] Stats display correctly in header

---

## 6.14 Next Steps

Once Step 6 is complete:

1. **Step 7**: Replace placeholder node components with full implementations (colors, icons, status indicators)
2. **Step 8**: Visual milestone - verify the complete graph renders correctly
3. **Step 9**: Replace placeholder modal with full implementation
