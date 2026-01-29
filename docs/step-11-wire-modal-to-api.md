# Step 11: Wire Modal to API - Field Configuration Persistence

## Overview

Step 11 connects the FieldConfigModal (Step 9) to the PUT endpoint (Step 10), enabling field mapping configurations to be saved to the database.

**Goal**: Complete the save flow with proper loading states, error handling, and graph refresh.

**Files to modify**:
- `src/components/admin/schema-graph/FieldConfigModal.tsx`
- `src/app/admin/(protected)/(dev)/dev/shopify/schema/page.tsx`

---

## 11.1 Current Implementation Status

### 11.1.1 Already Implemented ✅

The core API integration is **already complete** in `page.tsx` (lines 183-210):

```typescript
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
```

**What's working:**
- ✅ API call to PUT `/api/admin/shopify/schema/field`
- ✅ Request body includes fullPath, enabled, targetTable, targetColumn, transformType
- ✅ Error response parsing
- ✅ Graph refresh after successful save
- ✅ Modal closes on success
- ✅ `onSave` prop type updated to `Promise<void>`

### 11.1.2 Missing/Incomplete ❌

The modal lacks UX polish for async operations:

| Feature | Status | Impact |
|---------|--------|--------|
| Loading state during save | ❌ Missing | User doesn't know save is in progress |
| Save button spinner | ❌ Missing | No visual feedback |
| Disabled inputs during save | ❌ Missing | User could change form mid-save |
| Error display in modal | ❌ Missing | Errors thrown but not shown to user |
| Cancel disabled during save | ❌ Missing | User could close during save |

---

## 11.2 Implementation Steps

### Step 11.2.1: Add Loading/Error State to Modal

Update `src/components/admin/schema-graph/FieldConfigModal.tsx`:

#### 11.2.1a: Add State Variables

After line 80 (existing state declarations), add:

```typescript
// Async operation state
const [isSaving, setIsSaving] = useState(false)
const [saveError, setSaveError] = useState<string | null>(null)
```

#### 11.2.1b: Update handleSave

Replace the existing `handleSave` callback (lines 109-116) with:

```typescript
// Handle save with loading/error handling
const handleSave = useCallback(async () => {
  setIsSaving(true)
  setSaveError(null)

  try {
    await onSave({
      enabled,
      targetTable,
      targetColumn,
      transformType,
    })
    // Success - modal will be closed by parent
  } catch (error) {
    setSaveError(error instanceof Error ? error.message : 'Failed to save')
  } finally {
    setIsSaving(false)
  }
}, [enabled, targetTable, targetColumn, transformType, onSave])
```

#### 11.2.1c: Clear Error on Field Change

Add effect to clear error when form changes (after the `hasChanges` memo):

```typescript
// Clear save error when form changes
useEffect(() => {
  if (saveError) {
    setSaveError(null)
  }
  // Intentionally only clear on form value changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [enabled, targetTable, targetColumn, transformType])
```

#### 11.2.1d: Add Error Display

In the JSX, add error alert before the DialogFooter (around line 313):

```typescript
{/* Save Error Alert */}
{saveError && (
  <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
    <p className="text-sm text-red-800">
      <AlertTriangle className="w-4 h-4 inline mr-1" />
      {saveError}
    </p>
  </div>
)}
```

#### 11.2.1e: Update Save Button

Replace the Save button (line 319-321) with:

```typescript
<Button
  onClick={handleSave}
  disabled={!hasChanges || isSaving}
>
  {isSaving ? (
    <>
      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
      Saving...
    </>
  ) : (
    'Save'
  )}
</Button>
```

#### 11.2.1f: Disable Cancel During Save

Update the Cancel button (line 316-318):

```typescript
<Button
  variant="outline"
  onClick={() => onOpenChange(false)}
  disabled={isSaving}
>
  Cancel
</Button>
```

#### 11.2.1g: Add Loader2 Import

Update the lucide-react import (line 22) to include Loader2:

```typescript
import { Lock, Check, AlertTriangle, Link2, Box, Type, List, Info, Loader2 } from 'lucide-react'
```

---

## 11.3 Complete Updated FieldConfigModal

For reference, here's the complete updated component with all changes:

```typescript
'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Lock, Check, AlertTriangle, Link2, Box, Type, List, Info, Loader2 } from 'lucide-react'
import type { FieldNodeData } from '@/lib/types/schema-graph'

// ============================================================================
// Types
// ============================================================================

interface Props {
  field: FieldNodeData | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (data: FieldMappingFormData) => Promise<void>
}

export interface FieldMappingFormData {
  enabled: boolean
  targetTable: string
  targetColumn: string
  transformType: 'direct' | 'parseFloat' | 'parseInt' | 'lookup' | 'custom'
}

// ... (TRANSFORM_OPTIONS and KindIcon unchanged) ...

// ============================================================================
// Main Component
// ============================================================================

export function FieldConfigModal({ field, open, onOpenChange, onSave }: Props) {
  // Form state
  const [enabled, setEnabled] = useState(false)
  const [targetTable, setTargetTable] = useState('')
  const [targetColumn, setTargetColumn] = useState('')
  const [transformType, setTransformType] = useState<FieldMappingFormData['transformType']>('direct')

  // Async operation state
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Reset form when field changes
  useEffect(() => {
    if (field) {
      setEnabled(field.isEnabled || field.isProtected)
      setTargetTable(field.mapping?.targetTable || '')
      setTargetColumn(field.mapping?.targetColumn || '')
      setTransformType(field.mapping?.transformType || 'direct')
      setSaveError(null) // Clear any previous error
    }
  }, [field])

  // Track if form has changes
  const hasChanges = useMemo(() => {
    if (!field) return false
    const initialEnabled = field.isEnabled || field.isProtected
    const initialTable = field.mapping?.targetTable || ''
    const initialColumn = field.mapping?.targetColumn || ''
    const initialTransform = field.mapping?.transformType || 'direct'

    return (
      enabled !== initialEnabled ||
      targetTable !== initialTable ||
      targetColumn !== initialColumn ||
      transformType !== initialTransform
    )
  }, [field, enabled, targetTable, targetColumn, transformType])

  // Clear save error when form changes
  useEffect(() => {
    if (saveError) {
      setSaveError(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, targetTable, targetColumn, transformType])

  // Handle save with loading/error handling
  const handleSave = useCallback(async () => {
    setIsSaving(true)
    setSaveError(null)

    try {
      await onSave({
        enabled,
        targetTable,
        targetColumn,
        transformType,
      })
      // Success - modal will be closed by parent
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Failed to save')
    } finally {
      setIsSaving(false)
    }
  }, [enabled, targetTable, targetColumn, transformType, onSave])

  // Don't render if no field
  if (!field) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        {/* ... (DialogHeader unchanged) ... */}

        <div className="space-y-6 py-4">
          {/* ... (Field Information Section unchanged) ... */}
          {/* ... (Protected field warning unchanged) ... */}
          {/* ... (Sync Configuration Section unchanged) ... */}
        </div>

        {/* Save Error Alert */}
        {saveError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-800">
              <AlertTriangle className="w-4 h-4 inline mr-1" />
              {saveError}
            </p>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Save'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

---

## 11.4 Manual Testing

### 11.4.1 Prerequisites

```bash
# 1. Start dev server
npm run dev

# 2. Navigate to schema graph page
open http://localhost:3000/admin/dev/shopify/schema

# 3. Ensure schema cache is populated (entities visible)
```

### 11.4.2 Test Cases

#### Test 1: Successful Save (New Mapping)

1. Expand an entity (e.g., ProductVariant)
2. Click a field node (e.g., `.sku`)
3. Modal opens with field info
4. Toggle "Include in Sync" to ON
5. Enter Target Table: `Sku`
6. Enter Target Column: `ShopifySku`
7. Select Transform: `direct`
8. Click Save
9. **Expected**:
   - Save button shows spinner + "Saving..."
   - Cancel button disabled
   - After ~500ms, modal closes
   - Graph refreshes
   - Field node shows updated status (check icon or "Mapped" badge)

#### Test 2: Successful Save (Update Existing)

1. Click the same field again
2. Change Target Column to `VariantSku`
3. Click Save
4. **Expected**: Same as Test 1

#### Test 3: Validation Error

1. Click a field
2. Enable sync
3. Leave Target Table empty
4. Enter Target Column: `Test`
5. Click Save
6. **Expected**:
   - Modal stays open
   - Error alert appears: "targetTable is required when enabled"
   - Form values preserved

#### Test 4: Protected Field

1. Find a protected field (lock icon)
2. Click it
3. **Expected**:
   - Modal opens
   - "Include in Sync" toggle is ON and disabled
   - Yellow warning banner: "This is a protected field..."

#### Test 5: Error Cleared on Change

1. Trigger a save error (e.g., invalid transform type via DevTools)
2. Error alert shows
3. Change any form field
4. **Expected**: Error alert disappears

#### Test 6: Cancel During Save (Edge Case)

1. Click a field
2. Make changes
3. Click Save
4. Immediately try to click Cancel
5. **Expected**: Cancel button is disabled, can't close modal

### 11.4.3 Database Verification

After successful saves:

```bash
npx prisma studio
```

Navigate to `ShopifyFieldMapping` table. Verify:
- New records created for first-time saves
- Existing records updated for repeat saves
- `enabled`, `targetTable`, `targetColumn`, `transformType` match form values

---

## 11.5 Network Verification

Open DevTools → Network tab:

| Action | Expected Request | Expected Response |
|--------|------------------|-------------------|
| Click Save | `PUT /api/admin/shopify/schema/field` | 200 with `success: true` |
| Save triggers refresh | `GET /api/admin/shopify/schema` | 200 with updated nodes |

---

## 11.6 TypeScript Verification

After changes:

```bash
npm run type-check
```

Ensure no errors in:
- `src/components/admin/schema-graph/FieldConfigModal.tsx`
- `src/app/admin/(protected)/(dev)/dev/shopify/schema/page.tsx`

---

## 11.7 Edge Cases to Consider

### 11.7.1 Network Failure

Simulate offline:
1. DevTools → Network → Offline
2. Try to save
3. **Expected**: Error alert shows "Failed to fetch" or similar

### 11.7.2 Concurrent Edits

1. Open same field in two browser tabs
2. Save in Tab A
3. Save in Tab B with different values
4. **Expected**: Tab B's save succeeds (last write wins)

### 11.7.3 Modal Closed Before Response

If user somehow closes modal during save:
- Current implementation: No issue (save completes in background)
- Graph still refreshes when response arrives

---

## 11.8 Optional Enhancements (Not Required)

These are out of scope for Step 11 but noted for future consideration:

| Enhancement | Description |
|-------------|-------------|
| Optimistic updates | Update graph immediately, revert on error |
| Toast notifications | Show success/error toast instead of inline |
| Debounced auto-save | Save automatically after form changes settle |
| Undo support | Track previous state, allow revert |
| Bulk edit | Configure multiple fields at once |
| transformConfig UI | Add custom transform configuration fields |

---

## 11.9 Checklist

### Already Complete ✅
- [x] API call to PUT endpoint
- [x] Request body construction
- [x] Error response parsing
- [x] Graph refresh after save
- [x] Modal close on success
- [x] `onSave` prop type is `Promise<void>`

### To Implement ❌
- [ ] `isSaving` state in modal
- [ ] `saveError` state in modal
- [ ] Loading spinner on Save button
- [ ] "Saving..." text during save
- [ ] Disabled Cancel button during save
- [ ] Error alert display
- [ ] Clear error on form change
- [ ] Add `Loader2` import

---

## 11.10 Summary

Step 11 is **80% complete**. The core API integration works. The remaining 20% is UX polish:

| Component | Status | Action |
|-----------|--------|--------|
| page.tsx | ✅ Complete | No changes needed |
| FieldConfigModal.tsx | ⚠️ Partial | Add loading/error states |

After implementing the modal updates, the full save flow will be:
1. User clicks field → Modal opens
2. User makes changes → Save button enables
3. User clicks Save → Button shows spinner, Cancel disabled
4. API call executes
5. Success → Modal closes, graph refreshes
6. Error → Error alert shows, user can retry

---

## 11.11 Next Steps

After Step 11 is complete, the 11-step plan is **finished**. The schema graph system will be fully functional:

| Step | Description | Status |
|------|-------------|--------|
| 1-4 | Foundation (Prisma, types, graph builder) | ✅ |
| 5 | GET API endpoint | ✅ |
| 6 | Page route | ✅ |
| 7 | Node components | ✅ |
| 8 | Visual milestone | ✅ |
| 9 | FieldConfigModal | ✅ |
| 10 | PUT API endpoint | ✅ |
| 11 | Wire modal to API | ⚠️ 80% |

**Optional future work**:
- Step 12: transformConfig UI for custom transforms
- Step 13: Bulk field configuration
- Step 14: Import/export field mappings
- Step 15: Access testing (probe fields for restrictions)
