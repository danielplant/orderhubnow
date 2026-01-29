# Step 7: Entity + Field Node Components - Detailed Implementation Plan

## Overview

Create custom React Flow node components that render entities and fields with proper visual styling, status indicators, and click handling. These components replace React Flow's default node rendering.

---

## 7.1 Files to Create

```
src/components/admin/schema-graph/
├── EntityNode.tsx          ← Entity header nodes (Product, ProductVariant, etc.)
├── FieldNode.tsx           ← Field nodes with status indicators
├── FieldConfigModal.tsx    ← Placeholder (full implementation in Step 9)
├── node-styles.ts          ← Shared constants (colors, sizes)
└── index.ts                ← Barrel exports
```

---

## 7.2 Prerequisites

| Dependency | Location | Status |
|------------|----------|--------|
| React Flow types | `@xyflow/react` | ✅ Installed |
| Node data types | `src/lib/types/schema-graph.ts` | ✅ Exists |
| Lucide icons | `lucide-react` | ✅ Installed |
| cn utility | `@/lib/utils` | ✅ Exists |

---

## 7.3 Visual Design Specification

### 7.3.1 Entity Node

```
┌─────────────────────────────────────┐
│  ●  Product Variant                 │  ← Header with colored dot
│     42 fields                       │  ← Field count subtitle
└─────────────────────────────────────┘
     ↓ (edge connection point)
```

**Styling**:
- Background: Primary color (blue)
- Text: White
- Border: 2px solid, slightly darker
- Min width: 180px
- Padding: 12px 16px
- Border radius: 8px
- Shadow: subtle drop shadow

### 7.3.2 Field Node

```
┌───────────────────────────────────────────┐
│ ● .price                        🔗 🔒     │  ← Enabled dot, name, icons
│   Money                         → Sku.Price│  ← Type badge, mapping target
│   The price of the variant...             │  ← Description (truncated)
└───────────────────────────────────────────┘
```

**Status Indicators**:
| Indicator | Visual | Meaning |
|-----------|--------|---------|
| Enabled dot | 🟢 Green | Field included in sync |
| Disabled dot | ⚪ Gray | Field not synced |
| Lock icon | 🔒 | Protected field (can't disable) |
| Link icon | 🔗 | Relationship to another entity |
| Arrow icon | → | Has subfields (expandable) |
| Strikethrough | ~~text~~ | Deprecated field |

**Category Colors** (border/background tint):
| Category | Border Color | Background |
|----------|--------------|------------|
| system | Blue-500 | Blue-50 |
| timestamp | Purple-500 | Purple-50 |
| scalar | Gray-400 | White |
| enum | Amber-500 | Amber-50 |
| object | Green-500 | Green-50 |
| connection | Cyan-500 | Cyan-50 |
| polymorphic | Pink-500 | Pink-50 |
| count | Orange-500 | Orange-50 |

---

## 7.4 Implementation

### 7.4.1 Shared Styles (`node-styles.ts`)

```typescript
// src/components/admin/schema-graph/node-styles.ts

import type { FieldCategory } from '@/lib/shopify/introspect'

/**
 * Category → Tailwind color classes mapping
 */
export const CATEGORY_STYLES: Record<
  FieldCategory,
  { border: string; bg: string; text: string }
> = {
  system: {
    border: 'border-blue-500',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
  },
  timestamp: {
    border: 'border-purple-500',
    bg: 'bg-purple-50',
    text: 'text-purple-700',
  },
  count: {
    border: 'border-orange-500',
    bg: 'bg-orange-50',
    text: 'text-orange-700',
  },
  scalar: {
    border: 'border-gray-300',
    bg: 'bg-white',
    text: 'text-gray-700',
  },
  enum: {
    border: 'border-amber-500',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
  },
  object: {
    border: 'border-green-500',
    bg: 'bg-green-50',
    text: 'text-green-700',
  },
  connection: {
    border: 'border-cyan-500',
    bg: 'bg-cyan-50',
    text: 'text-cyan-700',
  },
  polymorphic: {
    border: 'border-pink-500',
    bg: 'bg-pink-50',
    text: 'text-pink-700',
  },
  contextual: {
    border: 'border-slate-400',
    bg: 'bg-slate-50',
    text: 'text-slate-600',
  },
  computed: {
    border: 'border-slate-400',
    bg: 'bg-slate-50',
    text: 'text-slate-600',
  },
  metafield: {
    border: 'border-indigo-500',
    bg: 'bg-indigo-50',
    text: 'text-indigo-700',
  },
}

/**
 * Default style for unknown categories
 */
export const DEFAULT_CATEGORY_STYLE = {
  border: 'border-gray-300',
  bg: 'bg-white',
  text: 'text-gray-700',
}

/**
 * Get styles for a category, with fallback
 */
export function getCategoryStyle(category: FieldCategory | string) {
  return CATEGORY_STYLES[category as FieldCategory] ?? DEFAULT_CATEGORY_STYLE
}

/**
 * Node dimensions
 */
export const NODE_DIMENSIONS = {
  entity: {
    minWidth: 180,
    padding: 'px-4 py-3',
  },
  field: {
    minWidth: 160,
    maxWidth: 280,
    padding: 'px-3 py-2',
  },
}
```

### 7.4.2 Entity Node Component

```typescript
// src/components/admin/schema-graph/EntityNode.tsx

'use client'

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Database } from 'lucide-react'
import type { EntityNodeData } from '@/lib/types/schema-graph'
import { cn } from '@/lib/utils'

/**
 * EntityNode - Renders entity header nodes (Product, ProductVariant, etc.)
 *
 * Visual design:
 * - Primary color background (distinguishes from field nodes)
 * - Entity name prominently displayed
 * - Field count as subtitle
 * - Connection handles for edges
 */
export const EntityNode = memo(function EntityNode({
  data,
  selected,
}: NodeProps) {
  const { entityName, displayName, fieldCount } = data as EntityNodeData

  return (
    <div
      className={cn(
        // Base styles
        'px-4 py-3 rounded-lg border-2 shadow-md',
        'min-w-[180px] transition-all duration-150',
        // Colors
        'bg-primary text-primary-foreground border-primary/80',
        // Selected state
        selected && 'ring-2 ring-offset-2 ring-primary/50'
      )}
    >
      {/* Target handle (incoming edges from other entities) */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-primary-foreground/50 !border-2 !border-primary"
      />

      {/* Content */}
      <div className="flex items-center gap-2">
        <Database className="h-4 w-4 opacity-70 flex-shrink-0" />
        <div className="min-w-0">
          <div className="font-semibold text-sm truncate">
            {displayName || entityName}
          </div>
          <div className="text-xs opacity-70">
            {fieldCount} field{fieldCount !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* Source handle (outgoing edges to field nodes) */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-primary-foreground/50 !border-2 !border-primary"
      />
    </div>
  )
})

EntityNode.displayName = 'EntityNode'
```

### 7.4.3 Field Node Component

```typescript
// src/components/admin/schema-graph/FieldNode.tsx

'use client'

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Lock, Link2, ChevronRight, AlertTriangle } from 'lucide-react'
import type { FieldNodeData } from '@/lib/types/schema-graph'
import { cn } from '@/lib/utils'
import { getCategoryStyle } from './node-styles'

/**
 * FieldNode - Renders field nodes with status indicators
 *
 * Visual design:
 * - Category-based border color
 * - Enabled/disabled indicator (green/gray dot)
 * - Protected indicator (lock icon)
 * - Relationship indicator (link icon)
 * - Expandable indicator (chevron for object types)
 * - Mapping target display (if mapped)
 * - Truncated description
 */
export const FieldNode = memo(function FieldNode({
  data,
  selected,
}: NodeProps) {
  const {
    fieldName,
    baseType,
    category,
    description,
    isEnabled,
    isProtected,
    isRelationship,
    targetEntity,
    isMapped,
    mapping,
    isReadonly,
    isDeprecated,
    kind,
  } = data as FieldNodeData

  // Get category-based styles
  const categoryStyle = getCategoryStyle(category)

  // Determine if this field has expandable subfields
  const hasSubfields = kind === 'OBJECT' && !isRelationship

  return (
    <div
      className={cn(
        // Base styles
        'rounded-md border-2 shadow-sm transition-all duration-150',
        'min-w-[160px] max-w-[280px]',
        categoryStyle.border,
        categoryStyle.bg,
        // Padding
        'px-3 py-2',
        // Interactive states
        !isReadonly && 'cursor-pointer hover:shadow-md',
        isReadonly && 'cursor-default opacity-70',
        // Selected state
        selected && 'ring-2 ring-offset-1 ring-primary/50',
        // Enabled state - add green ring
        isEnabled && !selected && 'ring-2 ring-green-500/30',
        // Deprecated state
        isDeprecated && 'opacity-50'
      )}
    >
      {/* Target handle (incoming edge from entity or parent field) */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2 !h-2 !bg-gray-400 !border-none"
      />

      {/* Source handle (outgoing edge to subfields) */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2 !h-2 !bg-gray-400 !border-none"
      />

      {/* Relationship handle (right side, for entity connections) */}
      {isRelationship && (
        <Handle
          type="source"
          position={Position.Right}
          id="relationship"
          className="!w-2 !h-2 !bg-blue-500 !border-none"
        />
      )}

      {/* Row 1: Status dot + Field name + Icons */}
      <div className="flex items-center gap-2">
        {/* Enabled/Disabled indicator */}
        <span
          className={cn(
            'w-2 h-2 rounded-full flex-shrink-0',
            isEnabled ? 'bg-green-500' : 'bg-gray-300'
          )}
          title={isEnabled ? 'Enabled' : 'Disabled'}
        />

        {/* Field name */}
        <span
          className={cn(
            'font-medium text-sm flex-1 truncate',
            isDeprecated && 'line-through'
          )}
        >
          .{fieldName}
        </span>

        {/* Status icons */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {isDeprecated && (
            <AlertTriangle
              className="h-3 w-3 text-amber-500"
              title="Deprecated"
            />
          )}
          {isProtected && (
            <Lock
              className="h-3 w-3 text-muted-foreground"
              title="Protected - cannot be disabled"
            />
          )}
          {isRelationship && (
            <Link2
              className="h-3 w-3 text-blue-500"
              title={`Relationship to ${targetEntity}`}
            />
          )}
          {hasSubfields && (
            <ChevronRight
              className="h-3 w-3 text-muted-foreground"
              title="Has subfields"
            />
          )}
        </div>
      </div>

      {/* Row 2: Type badge + Mapping target */}
      <div className="flex items-center gap-2 mt-1">
        {/* Type badge */}
        <span
          className={cn(
            'text-xs font-mono px-1.5 py-0.5 rounded',
            'bg-black/5 text-muted-foreground'
          )}
        >
          {baseType}
        </span>

        {/* Mapping target (if mapped) */}
        {isMapped && mapping?.targetColumn && (
          <span className="text-xs text-green-600 truncate">
            → {mapping.targetTable}.{mapping.targetColumn}
          </span>
        )}
      </div>

      {/* Row 3: Description (optional, truncated) */}
      {description && (
        <p
          className="text-xs text-muted-foreground mt-1 truncate"
          title={description}
        >
          {description}
        </p>
      )}

      {/* Readonly badge (for connection/polymorphic types) */}
      {isReadonly && (
        <div className="text-xs text-muted-foreground mt-1 italic">
          Read-only
        </div>
      )}
    </div>
  )
})

FieldNode.displayName = 'FieldNode'
```

### 7.4.4 Placeholder Modal Component

```typescript
// src/components/admin/schema-graph/FieldConfigModal.tsx

'use client'

import { X } from 'lucide-react'
import type { FieldNodeData, FieldMapping } from '@/lib/types/schema-graph'
import { Button } from '@/components/ui/button'

/**
 * FieldConfigModal - Placeholder for Step 9
 *
 * Shows basic field info and close button.
 * Full implementation with form fields comes in Step 9.
 */

interface FieldConfigModalProps {
  field: FieldNodeData
  onClose: () => void
  onSave: (mapping: Partial<FieldMapping>) => Promise<void>
}

export function FieldConfigModal({
  field,
  onClose,
  onSave,
}: FieldConfigModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h3 className="font-semibold text-lg">Configure Field</h3>
            <p className="text-sm text-muted-foreground font-mono">
              {field.fullPath}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-muted rounded transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content - Placeholder */}
        <div className="p-4 space-y-4">
          <div className="text-sm space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Type:</span>
              <span className="font-mono">{field.baseType}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Category:</span>
              <span>{field.category}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Enabled:</span>
              <span>{field.isEnabled ? 'Yes' : 'No'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Protected:</span>
              <span>{field.isProtected ? 'Yes' : 'No'}</span>
            </div>
          </div>

          {field.description && (
            <p className="text-sm text-muted-foreground border-t pt-4">
              {field.description}
            </p>
          )}

          <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm text-amber-800">
            Full configuration form coming in Step 9.
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-4 border-t bg-muted/30">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  )
}
```

### 7.4.5 Barrel Export

```typescript
// src/components/admin/schema-graph/index.ts

export { EntityNode } from './EntityNode'
export { FieldNode } from './FieldNode'
export { FieldConfigModal } from './FieldConfigModal'
export { getCategoryStyle, CATEGORY_STYLES, NODE_DIMENSIONS } from './node-styles'
```

---

## 7.5 Update Page to Use Custom Nodes

After creating the components, update the page to register them:

```typescript
// In src/app/admin/(protected)/(dev)/dev/shopify/schema/page.tsx

// Add imports
import { EntityNode } from '@/components/admin/schema-graph/EntityNode'
import { FieldNode } from '@/components/admin/schema-graph/FieldNode'
import { FieldConfigModal } from '@/components/admin/schema-graph/FieldConfigModal'
import type { FieldNodeData, FieldMapping } from '@/lib/types/schema-graph'

// Define nodeTypes OUTSIDE the component (important for performance)
const nodeTypes = {
  entity: EntityNode,
  field: FieldNode,
}

// Inside component, add state for modal
const [selectedField, setSelectedField] = useState<FieldNodeData | null>(null)

// Add click handler
const handleNodeClick = useCallback(
  (_event: React.MouseEvent, node: SchemaNode) => {
    if (node.data.nodeType === 'field') {
      const fieldData = node.data as FieldNodeData
      if (!fieldData.isReadonly) {
        setSelectedField(fieldData)
      }
    }
  },
  []
)

// Update ReactFlow component
<ReactFlow
  nodes={nodes}
  edges={edges}
  nodeTypes={nodeTypes}           // Add this
  onNodeClick={handleNodeClick}   // Add this
  fitView
>
  <Background />
  <Controls />
  <MiniMap
    nodeColor={(node) => {
      if (node.data?.nodeType === 'entity') return '#3b82f6'
      if ((node.data as FieldNodeData)?.isEnabled) return '#22c55e'
      return '#d1d5db'
    }}
  />
</ReactFlow>

// Add modal at the end (before closing </main>)
{selectedField && (
  <FieldConfigModal
    field={selectedField}
    onClose={() => setSelectedField(null)}
    onSave={async (mapping) => {
      // Step 10-11: API save
      console.log('Save mapping:', mapping)
      setSelectedField(null)
    }}
  />
)}
```

---

## 7.6 Step-by-Step Instructions

### 7.6.1 Create Directory

```bash
mkdir -p src/components/admin/schema-graph
```

### 7.6.2 Create Files in Order

1. **node-styles.ts** - Shared constants (no dependencies)
2. **EntityNode.tsx** - Simpler component (no category logic)
3. **FieldNode.tsx** - More complex (uses node-styles)
4. **FieldConfigModal.tsx** - Placeholder modal
5. **index.ts** - Barrel exports

### 7.6.3 Verify TypeScript

```bash
npm run type-check
```

### 7.6.4 Update Page

Add the imports and nodeTypes registration as shown in Section 7.5.

### 7.6.5 Test in Browser

1. Start dev server: `npm run dev`
2. Navigate to: `http://localhost:3000/admin/dev/shopify/schema`
3. Verify:
   - Entity nodes render with blue background
   - Field nodes render with category-colored borders
   - Enabled fields have green ring
   - Protected fields show lock icon
   - Relationship fields show link icon
   - Clicking non-readonly field opens modal
   - MiniMap shows colored nodes

---

## 7.7 React Flow Node Component Requirements

### 7.7.1 Must Use `memo`

```typescript
// ✅ CORRECT
export const EntityNode = memo(function EntityNode({ data }: NodeProps) {
  // ...
})

// ❌ WRONG - will re-render on every graph interaction
export function EntityNode({ data }: NodeProps) {
  // ...
}
```

### 7.7.2 Handle Types

Every node with connections needs `<Handle>` components:

```typescript
import { Handle, Position } from '@xyflow/react'

// Target = incoming edges
<Handle type="target" position={Position.Top} />

// Source = outgoing edges
<Handle type="source" position={Position.Bottom} />
```

### 7.7.3 Handle Styling

React Flow handles have default styles that need overriding with `!important`:

```typescript
<Handle
  className="!w-3 !h-3 !bg-blue-500 !border-none"
  // The ! prefix forces Tailwind to use !important
/>
```

### 7.7.4 NodeProps Type

```typescript
import { type NodeProps } from '@xyflow/react'

// NodeProps includes:
// - data: the node's data object
// - id: node ID
// - selected: boolean
// - isConnectable: boolean
// - xPos, yPos: position
// - type: node type string
// - zIndex: z-index
// - dragging: boolean
```

---

## 7.8 Testing Checklist

### Node Rendering
- [ ] Entity nodes render (blue background)
- [ ] Entity nodes show display name
- [ ] Entity nodes show field count
- [ ] Field nodes render with category-colored borders
- [ ] Field nodes show field name with dot prefix (.fieldName)
- [ ] Field nodes show type badge

### Status Indicators
- [ ] Enabled fields show green dot
- [ ] Disabled fields show gray dot
- [ ] Protected fields show lock icon
- [ ] Relationship fields show link icon
- [ ] Object fields (with subfields) show chevron icon
- [ ] Deprecated fields show strikethrough
- [ ] Readonly fields show "Read-only" label

### Visual States
- [ ] Enabled fields have green ring
- [ ] Selected nodes have primary ring
- [ ] Readonly fields have reduced opacity
- [ ] Hover on non-readonly field shows shadow

### Connections
- [ ] Handles visible on nodes
- [ ] Edges connect to handles properly
- [ ] Relationship handle on right side of relationship fields

### Click Handling
- [ ] Clicking entity node does NOT open modal
- [ ] Clicking field node opens modal
- [ ] Clicking readonly field does NOT open modal
- [ ] Modal shows field fullPath
- [ ] Modal close button works

### MiniMap
- [ ] Entity nodes show as blue
- [ ] Enabled fields show as green
- [ ] Disabled fields show as gray

---

## 7.9 Potential Issues & Solutions

| Issue | Symptom | Solution |
|-------|---------|----------|
| **Nodes render as rectangles** | No custom styling visible | Verify `nodeTypes` is passed to ReactFlow and defined outside component |
| **"Unknown node type" warning** | Console warning | Ensure node.type matches key in nodeTypes object ("entity", "field") |
| **Handles not visible** | No connection points | Add `<Handle>` components with proper `type` and `position` |
| **Handles wrong position** | Edges connect incorrectly | Check `Position.Top`, `Position.Bottom`, etc. match edge direction |
| **Styles not applying** | Tailwind classes ignored | Run `npm run dev` to trigger Tailwind rebuild; check class names |
| **Handle styles ignored** | Default React Flow styles | Use `!important` via `!` prefix in Tailwind classes |
| **Performance issues** | Laggy graph | Ensure components use `memo()` wrapper |
| **Import errors** | Module not found | Check barrel export in `index.ts` includes all components |
| **Type errors on NodeProps** | TypeScript complaints | Cast `data` to correct type: `data as FieldNodeData` |

---

## 7.10 Completion Checklist

- [ ] Directory created: `src/components/admin/schema-graph/`
- [ ] File created: `node-styles.ts`
- [ ] File created: `EntityNode.tsx`
- [ ] File created: `FieldNode.tsx`
- [ ] File created: `FieldConfigModal.tsx` (placeholder)
- [ ] File created: `index.ts`
- [ ] All components use `memo()` wrapper
- [ ] All components have `displayName` set
- [ ] Page updated with `nodeTypes` prop
- [ ] Page updated with `onNodeClick` handler
- [ ] Page updated with modal state and rendering
- [ ] `npm run type-check` passes
- [ ] Entity nodes render correctly
- [ ] Field nodes render with category colors
- [ ] Status indicators display correctly
- [ ] Click on field opens modal
- [ ] MiniMap shows colored nodes

---

## 7.11 Next Steps

Once Step 7 is complete:

1. **Step 8**: Visual milestone verification - confirm full graph renders correctly
2. **Step 9**: Replace placeholder modal with full implementation
3. **Step 10**: Create POST API endpoint for saving field configuration
4. **Step 11**: Wire modal save to API and update node state
