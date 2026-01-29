# Step 9: Field Config Modal - Detailed Implementation Plan

## Overview

Create the modal component that opens when a user clicks on a field node. This modal allows users to:
1. View field metadata (readonly)
2. Enable/disable the field for sync
3. Map the field to a SQL table/column
4. Configure transform type

---

## 9.1 Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/components/admin/schema-graph/FieldConfigModal.tsx` | **Create** | Modal component |
| `src/components/admin/schema-graph/index.ts` | **Modify** | Add export |
| `src/app/admin/(protected)/(dev)/dev/shopify/schema/page.tsx` | **Modify** | Wire click handler + modal |

---

## 9.2 Prerequisites

| Dependency | Location | Status |
|------------|----------|--------|
| Dialog component | `@/components/ui/dialog` | ✅ Exists |
| Select component | `@/components/ui/select` | ✅ Exists |
| Input component | `@/components/ui/input` | ✅ Exists |
| Label component | `@/components/ui/label` | ✅ Exists |
| Button component | `@/components/ui/button` | ✅ Exists |
| FieldNodeData type | `@/lib/types/schema-graph` | ✅ Exists |
| FieldMapping type | `@/lib/types/schema-graph` | ✅ Exists |

---

## 9.3 Modal Layout Specification

```
┌─────────────────────────────────────────────────────────────────┐
│  Configure Field                                            [X] │
│  ProductVariant.price.amount                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─ Field Info ──────────────────────────────────────────────┐  │
│  │  Type: Money          Kind: OBJECT                        │  │
│  │  Category: object     Depth: 2                            │  │
│  │                                                            │  │
│  │  The monetary value of the price.                         │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌─ Status Badges ───────────────────────────────────────────┐  │
│  │  [🔒 Protected]  [→ InventoryItem]  [⚠️ Deprecated]       │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌─ Sync Configuration ──────────────────────────────────────┐  │
│  │                                                            │  │
│  │  [✓] Include in sync                                      │  │
│  │                                                            │  │
│  │  Target Table          Target Column                       │  │
│  │  ┌──────────────┐     ┌──────────────────────────────┐    │  │
│  │  │ Sku        ▼ │     │ Price                        │    │  │
│  │  └──────────────┘     └──────────────────────────────┘    │  │
│  │                                                            │  │
│  │  Transform                                                 │  │
│  │  ┌────────────────────────────────────────────────────┐   │  │
│  │  │ Parse as Float                                   ▼ │   │  │
│  │  └────────────────────────────────────────────────────┘   │  │
│  │                                                            │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                                    [Cancel]  [Save Configuration]│
└─────────────────────────────────────────────────────────────────┘
```

---

## 9.4 Form State

```typescript
interface ModalFormState {
  enabled: boolean
  targetTable: string
  targetColumn: string
  transformType: 'direct' | 'parseFloat' | 'parseInt' | 'lookup' | 'custom'
}
```

**Initial values** come from `field.mapping` if exists, otherwise defaults:
- `enabled`: `field.isEnabled`
- `targetTable`: `field.mapping?.targetTable ?? ''`
- `targetColumn`: `field.mapping?.targetColumn ?? ''`
- `transformType`: `field.mapping?.transformType ?? 'direct'`

---

## 9.5 Implementation

### 9.5.1 FieldConfigModal Component

```typescript
// src/components/admin/schema-graph/FieldConfigModal.tsx

'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Lock, Link2, AlertTriangle, Eye, Loader2 } from 'lucide-react'
import type { FieldNodeData, FieldMapping } from '@/lib/types/schema-graph'
import { cn } from '@/lib/utils'

// ============================================================================
// Constants
// ============================================================================

/**
 * Known target tables in the database.
 * These are the tables that Shopify fields can be mapped to.
 */
const TARGET_TABLES = [
  { value: 'Sku', label: 'Sku' },
  { value: 'RawSkusFromShopify', label: 'RawSkusFromShopify' },
  { value: 'Product', label: 'Product' },
  { value: 'ProductVariant', label: 'ProductVariant' },
  { value: 'InventoryItem', label: 'InventoryItem' },
  { value: 'Collection', label: 'Collection' },
] as const

/**
 * Transform types for converting Shopify values to SQL values.
 */
const TRANSFORM_TYPES = [
  { value: 'direct', label: 'Direct (no transform)', description: 'Use value as-is' },
  { value: 'parseFloat', label: 'Parse as Float', description: 'Convert to decimal number' },
  { value: 'parseInt', label: 'Parse as Integer', description: 'Convert to whole number' },
  { value: 'lookup', label: 'Lookup Table', description: 'Map via lookup table' },
  { value: 'custom', label: 'Custom Expression', description: 'Custom transform logic' },
] as const

// ============================================================================
// Component
// ============================================================================

interface FieldConfigModalProps {
  field: FieldNodeData
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (mapping: Partial<FieldMapping>) => Promise<void>
}

export function FieldConfigModal({
  field,
  open,
  onOpenChange,
  onSave,
}: FieldConfigModalProps) {
  // ─────────────────────────────────────────────────────────────────────────
  // Form State
  // ─────────────────────────────────────────────────────────────────────────
  const [enabled, setEnabled] = useState(field.isEnabled)
  const [targetTable, setTargetTable] = useState(field.mapping?.targetTable ?? '')
  const [targetColumn, setTargetColumn] = useState(field.mapping?.targetColumn ?? '')
  const [transformType, setTransformType] = useState<string>(
    field.mapping?.transformType ?? 'direct'
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset form when field changes
  useEffect(() => {
    setEnabled(field.isEnabled)
    setTargetTable(field.mapping?.targetTable ?? '')
    setTargetColumn(field.mapping?.targetColumn ?? '')
    setTransformType(field.mapping?.transformType ?? 'direct')
    setError(null)
  }, [field])

  // ─────────────────────────────────────────────────────────────────────────
  // Derived State
  // ─────────────────────────────────────────────────────────────────────────
  const isReadonly = field.isReadonly || field.isProtected
  const hasChanges =
    enabled !== field.isEnabled ||
    targetTable !== (field.mapping?.targetTable ?? '') ||
    targetColumn !== (field.mapping?.targetColumn ?? '') ||
    transformType !== (field.mapping?.transformType ?? 'direct')

  // ─────────────────────────────────────────────────────────────────────────
  // Handlers
  // ─────────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true)
    setError(null)

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
        accessStatus: 'untested',
      })
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    // Reset form to original values
    setEnabled(field.isEnabled)
    setTargetTable(field.mapping?.targetTable ?? '')
    setTargetColumn(field.mapping?.targetColumn ?? '')
    setTransformType(field.mapping?.transformType ?? 'direct')
    setError(null)
    onOpenChange(false)
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        {/* Header */}
        <DialogHeader>
          <DialogTitle>Configure Field</DialogTitle>
          <DialogDescription className="font-mono text-xs">
            {field.fullPath}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* ─────────────────────────────────────────────────────────────── */}
          {/* Field Info Section (readonly) */}
          {/* ─────────────────────────────────────────────────────────────── */}
          <section className="space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground">
              Field Info
            </h4>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm bg-muted/30 rounded-lg p-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Type:</span>
                <span className="font-mono">{field.baseType}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Kind:</span>
                <span>{field.kind}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Category:</span>
                <span>{field.category}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Depth:</span>
                <span>{field.depth}</span>
              </div>
            </div>
            {field.description && (
              <p className="text-sm text-muted-foreground bg-muted/30 rounded-lg p-3">
                {field.description}
              </p>
            )}
          </section>

          {/* ─────────────────────────────────────────────────────────────── */}
          {/* Status Badges */}
          {/* ─────────────────────────────────────────────────────────────── */}
          <section className="flex flex-wrap gap-2">
            {field.isProtected && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                <Lock className="h-3 w-3" />
                Protected
              </span>
            )}
            {field.isRelationship && field.targetEntity && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                <Link2 className="h-3 w-3" />
                → {field.targetEntity}
              </span>
            )}
            {field.isDeprecated && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                <AlertTriangle className="h-3 w-3" />
                Deprecated
              </span>
            )}
            {field.isReadonly && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                <Eye className="h-3 w-3" />
                Read-only
              </span>
            )}
          </section>

          {/* ─────────────────────────────────────────────────────────────── */}
          {/* Sync Configuration (editable unless readonly) */}
          {/* ─────────────────────────────────────────────────────────────── */}
          {!isReadonly && (
            <section className="space-y-4">
              <h4 className="text-sm font-medium text-muted-foreground">
                Sync Configuration
              </h4>

              {/* Enable Toggle */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="enabled"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <Label htmlFor="enabled" className="font-medium cursor-pointer">
                  Include in sync
                </Label>
              </div>

              {/* Target Mapping (only show if enabled) */}
              {enabled && (
                <div className="space-y-4 pl-7">
                  {/* Target Table */}
                  <div className="space-y-2">
                    <Label htmlFor="targetTable">Target Table</Label>
                    <Select value={targetTable} onValueChange={setTargetTable}>
                      <SelectTrigger id="targetTable" className="w-full">
                        <SelectValue placeholder="Select table..." />
                      </SelectTrigger>
                      <SelectContent>
                        {TARGET_TABLES.map((table) => (
                          <SelectItem key={table.value} value={table.value}>
                            {table.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Target Column */}
                  <div className="space-y-2">
                    <Label htmlFor="targetColumn">Target Column</Label>
                    <Input
                      id="targetColumn"
                      value={targetColumn}
                      onChange={(e) => setTargetColumn(e.target.value)}
                      placeholder="e.g., Price, Title, Sku"
                    />
                  </div>

                  {/* Transform Type (only show if column specified) */}
                  {targetColumn && (
                    <div className="space-y-2">
                      <Label htmlFor="transformType">Transform</Label>
                      <Select value={transformType} onValueChange={setTransformType}>
                        <SelectTrigger id="transformType" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TRANSFORM_TYPES.map((transform) => (
                            <SelectItem key={transform.value} value={transform.value}>
                              <div className="flex flex-col">
                                <span>{transform.label}</span>
                                <span className="text-xs text-muted-foreground">
                                  {transform.description}
                                </span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {/* Readonly Message */}
          {isReadonly && (
            <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground">
              {field.isProtected
                ? 'This field is protected and cannot be modified.'
                : 'This field type cannot be configured for sync.'}
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={saving}>
            Cancel
          </Button>
          {!isReadonly && (
            <Button onClick={handleSave} disabled={saving || !hasChanges}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Configuration
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

### 9.5.2 Update Index Exports

```typescript
// src/components/admin/schema-graph/index.ts

/**
 * Schema Graph Components
 *
 * Custom React Flow node components for the Shopify schema visualization.
 */

// Component exports
export { EntityNode } from './EntityNode'
export { FieldNode } from './FieldNode'
export { FieldConfigModal } from './FieldConfigModal'  // ADD THIS

// Style exports (battery pack)
export * from './node-styles'

// Node types registry
import { EntityNode } from './EntityNode'
import { FieldNode } from './FieldNode'

/**
 * CRITICAL: Define nodeTypes outside component to prevent re-registration on every render.
 * This is a React Flow performance requirement.
 */
export const schemaNodeTypes = {
  entity: EntityNode,
  field: FieldNode,
} as const
```

### 9.5.3 Update Page to Wire Modal

```typescript
// src/app/admin/(protected)/(dev)/dev/shopify/schema/page.tsx

// ADD these imports at top:
import { schemaNodeTypes, MINIMAP_COLORS, FieldConfigModal } from '@/components/admin/schema-graph'
import type { SchemaNode, SchemaEdge, EntityNodeData, FieldNodeData, FieldMapping } from '@/lib/types/schema-graph'

// INSIDE the component, ADD state for modal:
const [selectedField, setSelectedField] = useState<FieldNodeData | null>(null)

// ADD click handler:
const handleNodeClick = useCallback(
  (_event: React.MouseEvent, node: SchemaNode) => {
    // Only handle field nodes
    if (node.data.nodeType !== 'field') return

    const fieldData = node.data as FieldNodeData

    // Don't open modal for readonly fields
    if (fieldData.isReadonly) return

    setSelectedField(fieldData)
  },
  []
)

// ADD save handler:
const handleFieldSave = useCallback(
  async (mapping: Partial<FieldMapping>) => {
    // Step 10: This will call the API
    const res = await fetch('/api/admin/shopify/schema/field', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mapping),
    })

    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || 'Failed to save')
    }

    // Update local node state with new mapping
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
              isMapped: !!(mapping.targetTable && mapping.targetColumn),
              mapping: {
                ...(node.data as FieldNodeData).mapping,
                ...mapping,
              },
            },
          }
        }
        return node
      })
    )
  },
  [setNodes]
)

// UPDATE ReactFlow component to add onNodeClick:
<ReactFlow
  nodes={visibleNodes}
  edges={visibleEdges}
  nodeTypes={schemaNodeTypes}
  onNodeClick={handleNodeClick}  // ADD THIS
  nodesDraggable={false}
  fitView
>
  <Background />
  <Controls />
  <MiniMap nodeColor={getMinimapNodeColor} />
</ReactFlow>

// ADD modal at end of component (before closing </main>):
{/* Field Configuration Modal */}
<FieldConfigModal
  field={selectedField!}
  open={selectedField !== null}
  onOpenChange={(open) => {
    if (!open) setSelectedField(null)
  }}
  onSave={handleFieldSave}
/>
```

---

## 9.6 Step-by-Step Instructions

### 9.6.1 Create Modal Component

Create `src/components/admin/schema-graph/FieldConfigModal.tsx` with the code from Section 9.5.1.

### 9.6.2 Update Index Exports

Add the export to `src/components/admin/schema-graph/index.ts` as shown in Section 9.5.2.

### 9.6.3 Update Page Component

Apply the changes from Section 9.5.3 to the page:
1. Add imports
2. Add `selectedField` state
3. Add `handleNodeClick` callback
4. Add `handleFieldSave` callback
5. Add `onNodeClick` prop to ReactFlow
6. Add FieldConfigModal component

### 9.6.4 Verify TypeScript

```bash
npm run type-check
```

### 9.6.5 Test in Browser

1. Start dev server: `npm run dev`
2. Navigate to: `http://localhost:3000/admin/dev/shopify/schema`
3. Expand an entity
4. Click on a field node
5. Verify modal opens with field data
6. Test form interactions
7. Click Cancel - verify modal closes without save
8. Make changes and Save - verify save attempt (will fail until Step 10)

---

## 9.7 Form Validation Rules

| Field | Validation | Error Message |
|-------|------------|---------------|
| enabled | No validation | - |
| targetTable | Required if enabled | "Select a target table" |
| targetColumn | Required if targetTable set | "Enter a column name" |
| transformType | Has default | - |

**Note**: Full validation will be added when API endpoint is implemented (Step 10).

---

## 9.8 Conditional Display Logic

```
If field.isReadonly OR field.isProtected:
  → Show readonly message
  → Hide form fields
  → Hide Save button

If NOT enabled:
  → Hide targetTable, targetColumn, transformType

If enabled AND targetColumn is empty:
  → Hide transformType
```

---

## 9.9 Testing Checklist

### Modal Opening
- [ ] Click entity node → modal does NOT open
- [ ] Click readonly field → modal does NOT open
- [ ] Click regular field → modal opens
- [ ] Modal shows correct field fullPath
- [ ] Modal shows correct field info

### Field Info Section
- [ ] Type displays correctly
- [ ] Kind displays correctly
- [ ] Category displays correctly
- [ ] Depth displays correctly
- [ ] Description displays (if present)

### Status Badges
- [ ] Protected badge shows for protected fields
- [ ] Relationship badge shows for relationship fields
- [ ] Deprecated badge shows for deprecated fields
- [ ] Readonly badge shows for readonly fields

### Form Interactions
- [ ] Enable checkbox toggles
- [ ] Enabling shows mapping fields
- [ ] Disabling hides mapping fields
- [ ] Table dropdown works
- [ ] Column input works
- [ ] Transform dropdown shows when column filled

### Buttons
- [ ] Cancel closes modal
- [ ] Cancel resets form to original values
- [ ] Save is disabled when no changes
- [ ] Save is enabled when changes made
- [ ] Save shows loading spinner
- [ ] Save closes modal on success

### Edge Cases
- [ ] Modal for protected field shows readonly message
- [ ] Modal for readonly field shows readonly message
- [ ] Error message displays on save failure
- [ ] Form resets when different field selected

---

## 9.10 Keyboard Accessibility

| Key | Action |
|-----|--------|
| Escape | Close modal |
| Tab | Navigate form fields |
| Enter | Submit form (when Save focused) |
| Space | Toggle checkbox |

The Radix Dialog component handles most of this automatically.

---

## 9.11 Potential Issues & Solutions

| Issue | Symptom | Solution |
|-------|---------|----------|
| **Modal doesn't open** | Click does nothing | Verify `onNodeClick` is passed to ReactFlow |
| **Modal opens for entity** | Wrong node type | Check `node.data.nodeType !== 'field'` guard |
| **Form not resetting** | Old values persist | Verify `useEffect` resets on `field` change |
| **Save fails** | Error in console | API endpoint not yet created (Step 10) |
| **Select not opening** | Click does nothing | Check Select component imports are correct |
| **Styles look wrong** | Missing spacing/colors | Verify all UI component imports |
| **Type errors** | TypeScript complaints | Check FieldMapping type matches form state |

---

## 9.12 Completion Checklist

- [ ] Created `FieldConfigModal.tsx`
- [ ] Added export to `index.ts`
- [ ] Added `selectedField` state to page
- [ ] Added `handleNodeClick` to page
- [ ] Added `handleFieldSave` to page
- [ ] Added `onNodeClick` prop to ReactFlow
- [ ] Added FieldConfigModal to page JSX
- [ ] `npm run type-check` passes
- [ ] Click field → modal opens
- [ ] Modal shows correct field data
- [ ] Form interactions work
- [ ] Cancel closes and resets
- [ ] Save attempts API call (can fail until Step 10)

---

## 9.13 Next Steps

Once Step 9 is complete:

1. **Step 10**: Create `POST /api/admin/shopify/schema/field` endpoint
2. **Step 11**: Wire modal save to API and implement optimistic updates

The modal is now functional but save will fail until the API endpoint exists.
