'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { updateSizeOrderConfig } from '@/lib/data/actions/settings'
import { DEFAULT_SIZE_ORDER } from '@/lib/utils/size-sort'
import { GripVertical, X, Check, Loader2, Upload } from 'lucide-react'

interface SizeOrderConfigProps {
  initialSizes: string[]
}

// Sortable item component
function SortableItem({
  id,
  onRemove,
  canRemove,
  highlightId,
}: {
  id: string
  onRemove: (id: string) => void
  canRemove: boolean
  highlightId: string | null
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const isHighlighted = highlightId === id

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        group flex items-center gap-3 px-3 py-2 rounded-md border
        ${isDragging ? 'bg-muted shadow-lg scale-[1.02] border-primary/30 z-50' : 'bg-background border-transparent'}
        ${isHighlighted ? 'bg-primary/10 border-primary/30' : ''}
        hover:bg-muted/50 transition-all duration-150
      `}
    >
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground touch-none"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="flex-1 text-sm font-mono">{id}</span>
      {canRemove && (
        <button
          type="button"
          onClick={() => onRemove(id)}
          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

export function SizeOrderConfig({ initialSizes }: SizeOrderConfigProps) {
  const [sizes, setSizes] = useState<string[]>(initialSizes)
  const [originalSizes] = useState<string[]>(initialSizes)
  const [isPending, startTransition] = useTransition()
  const [status, setStatus] = useState<{ kind: 'success' | 'error'; message: string } | null>(null)
  const [newSize, setNewSize] = useState('')
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [importText, setImportText] = useState('')
  const [importError, setImportError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Track if there are unsaved changes
  const hasChanges = JSON.stringify(sizes) !== JSON.stringify(originalSizes)

  // Clear highlight after animation
  useEffect(() => {
    if (highlightId) {
      const timer = setTimeout(() => setHighlightId(null), 1500)
      return () => clearTimeout(timer)
    }
  }, [highlightId])

  // Clear status after a few seconds
  useEffect(() => {
    if (status?.kind === 'success') {
      const timer = setTimeout(() => setStatus(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [status])

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setSizes((items) => {
        const oldIndex = items.indexOf(active.id as string)
        const newIndex = items.indexOf(over.id as string)
        return arrayMove(items, oldIndex, newIndex)
      })
    }
  }

  function handleAddSize() {
    const trimmed = newSize.trim().toUpperCase()
    if (!trimmed) return

    // Check if already exists
    if (sizes.includes(trimmed)) {
      setHighlightId(trimmed)
      setNewSize('')
      return
    }

    setSizes((prev) => [...prev, trimmed])
    setNewSize('')
    inputRef.current?.focus()
  }

  function handleRemoveSize(id: string) {
    if (sizes.length <= 1) return
    setSizes((prev) => prev.filter((s) => s !== id))
  }

  function handleSave() {
    setStatus(null)
    startTransition(async () => {
      const result = await updateSizeOrderConfig(sizes)
      if (result.success) {
        setStatus({ kind: 'success', message: result.message ?? 'Saved.' })
      } else {
        setStatus({ kind: 'error', message: result.error })
      }
    })
  }

  function handleImport() {
    setImportError(null)

    // Parse input: split by newlines or commas
    const parsed = importText
      .split(/[\n,]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean)

    if (parsed.length === 0) {
      setImportError('No sizes detected')
      return
    }

    // Check for duplicates
    const unique = [...new Set(parsed)]
    if (unique.length !== parsed.length) {
      setImportError(`${parsed.length - unique.length} duplicate(s) will be removed`)
    }

    setSizes(unique)
    setShowImportDialog(false)
    setImportText('')
    setImportError(null)
  }

  function handleResetToDefaults() {
    setSizes([...DEFAULT_SIZE_ORDER])
    setShowImportDialog(false)
    setImportText('')
  }

  // Parse import preview
  const importPreview = importText
    .split(/[\n,]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
  const importUniqueCount = new Set(importPreview).size

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Size Order</CardTitle>
          <CardDescription>
            Defines how sizes sort across product cards and reports. Drag to reorder.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Scrollable list container */}
          <div className="max-h-[400px] overflow-y-auto rounded-lg border border-border bg-muted/30 p-2">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={sizes} strategy={verticalListSortingStrategy}>
                <div className="space-y-1">
                  {sizes.map((size) => (
                    <SortableItem
                      key={size}
                      id={size}
                      onRemove={handleRemoveSize}
                      canRemove={sizes.length > 1}
                      highlightId={highlightId}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            {/* Add new size input - at bottom of list */}
            <div className="mt-2 flex items-center gap-2 px-3 py-2">
              <div className="w-4" /> {/* Spacer for grip icon alignment */}
              <Input
                ref={inputRef}
                type="text"
                placeholder="Add size..."
                value={newSize}
                onChange={(e) => setNewSize(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleAddSize()
                  }
                }}
                className="flex-1 h-8 text-sm font-mono bg-background"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleAddSize}
                disabled={!newSize.trim()}
                className="h-8 px-2"
              >
                Add
              </Button>
            </div>
          </div>

          {/* Size count */}
          <p className="text-xs text-muted-foreground">
            {sizes.length} size{sizes.length !== 1 ? 's' : ''} configured
          </p>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowImportDialog(true)}
            >
              <Upload className="h-4 w-4 mr-2" />
              Import List...
            </Button>

            <div className="flex items-center gap-3">
              {status && (
                <span
                  className={`text-sm ${
                    status.kind === 'success' ? 'text-green-600' : 'text-destructive'
                  }`}
                >
                  {status.kind === 'success' && <Check className="inline h-4 w-4 mr-1" />}
                  {status.message}
                </span>
              )}
              <Button
                type="button"
                onClick={handleSave}
                disabled={isPending || !hasChanges}
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Import Dialog */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Import Size List</DialogTitle>
            <DialogDescription>
              Paste sizes separated by commas or new lines. This will replace the current list.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <textarea
              value={importText}
              onChange={(e) => {
                setImportText(e.target.value)
                setImportError(null)
              }}
              placeholder={`Example:\n0/6M, 6/12M, 12/18M\n2T, 3T, 4\nXS, S, M, L, XL`}
              className="w-full h-40 px-3 py-2 text-sm font-mono border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            />

            {importPreview.length > 0 && (
              <p className="text-sm text-muted-foreground">
                {importUniqueCount} size{importUniqueCount !== 1 ? 's' : ''} detected
                {importUniqueCount !== importPreview.length && (
                  <span className="text-amber-600 ml-2">
                    ({importPreview.length - importUniqueCount} duplicates)
                  </span>
                )}
              </p>
            )}

            {importError && (
              <p className="text-sm text-destructive">{importError}</p>
            )}
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleResetToDefaults}
              className="sm:mr-auto"
            >
              Use Defaults
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowImportDialog(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleImport}
              disabled={importPreview.length === 0}
            >
              Import {importUniqueCount > 0 ? `(${importUniqueCount})` : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
