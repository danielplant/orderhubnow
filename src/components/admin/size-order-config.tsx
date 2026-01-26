'use client'

import { useState, useTransition, useEffect } from 'react'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { updateSizeOrderConfig, upsertSizeAlias, deleteSizeAlias, removeCanonicalSizeWithAliases } from '@/lib/data/actions/settings'
import { GripVertical, X, Check, Loader2, Plus, AlertCircle, AlertTriangle, Link2, Trash2, Pencil } from 'lucide-react'

interface DistinctSize {
  size: string
  count: number
}

interface MissingSizeSku {
  skuId: string
  shopifyVariantId: string | null
  description: string | null
}

interface SizeAlias {
  raw: string
  canonical: string
}

interface SizeOrderConfigProps {
  initialSizes: string[]
  distinctSizes: DistinctSize[]
  missingSizeSkus: MissingSizeSku[]
  aliases: SizeAlias[]
}

// Sortable item component for the mapped list
function SortableItem({
  id,
  count,
  onRemove,
}: {
  id: string
  count?: number
  onRemove: (id: string) => void
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        group flex items-center gap-3 px-3 py-2 rounded-md border
        ${isDragging ? 'bg-muted shadow-lg scale-[1.02] border-primary/30 z-50' : 'bg-background border-transparent'}
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
      {count !== undefined && (
        <span className="text-xs text-muted-foreground">{count} SKUs</span>
      )}
      <button
        type="button"
        onClick={() => onRemove(id)}
        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

// Chip component for unmapped sizes
function SizeChip({
  size,
  count,
  onAdd,
}: {
  size: string
  count: number
  onAdd: (size: string) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onAdd(size)}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 text-sm font-mono hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors group"
    >
      <Plus className="h-3 w-3 text-amber-600 dark:text-amber-400" />
      <span>{size}</span>
      <span className="text-xs text-amber-600 dark:text-amber-400">({count})</span>
    </button>
  )
}

export function SizeOrderConfig({ initialSizes, distinctSizes, missingSizeSkus, aliases: initialAliases }: SizeOrderConfigProps) {
  const [sizes, setSizes] = useState<string[]>(initialSizes)
  const [originalSizes, setOriginalSizes] = useState<string[]>(initialSizes)
  const [aliases, setAliases] = useState<SizeAlias[]>(initialAliases)
  const [isPending, startTransition] = useTransition()
  const [status, setStatus] = useState<{ kind: 'success' | 'error'; message: string } | null>(null)

  // Modal states
  const [showMissingModal, setShowMissingModal] = useState(false)
  const [showAliasModal, setShowAliasModal] = useState(false)
  const [editingAlias, setEditingAlias] = useState<SizeAlias | null>(null)
  const [newAliasRaw, setNewAliasRaw] = useState('')
  const [newAliasCanonical, setNewAliasCanonical] = useState('')

  // Remove confirmation state (for sizes with aliases pointing to them)
  const [removeConfirm, setRemoveConfirm] = useState<{
    size: string
    affectedAliases: SizeAlias[]
  } | null>(null)

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

  // Create a lookup for counts
  const sizeCountMap = new Map(distinctSizes.map(d => [d.size.toUpperCase(), d.count]))

  // Compute unmapped sizes (in Shopify data but not in our mapped list)
  const mappedSet = new Set(sizes.map(s => s.toUpperCase()))
  const unmappedSizes = distinctSizes.filter(d => !mappedSet.has(d.size.toUpperCase()))

  // Track if there are unsaved changes
  const hasChanges = JSON.stringify(sizes) !== JSON.stringify(originalSizes)

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

  function handleAddSize(sizeToAdd: string) {
    // Preserve raw size exactly as-is from Shopify
    if (!sizeToAdd) return

    // Check if already exists (case-insensitive to prevent XS and xs both being added)
    if (sizes.some(s => s.toUpperCase() === sizeToAdd.toUpperCase())) {
      return
    }

    // Add to end of list preserving exact case from Shopify
    setSizes((prev) => [...prev, sizeToAdd])
  }

  function handleRemoveSize(id: string) {
    // Check if any aliases use this size as their canonical target
    const affectedAliases = aliases.filter(
      a => a.canonical.toUpperCase() === id.toUpperCase()
    )

    if (affectedAliases.length > 0) {
      // Show confirmation dialog
      setRemoveConfirm({ size: id, affectedAliases })
    } else {
      // Safe to remove directly
      setSizes((prev) => prev.filter((s) => s !== id))
    }
  }

  function handleConfirmRemove(deleteAliases: boolean) {
    if (!removeConfirm) return

    const { size, affectedAliases } = removeConfirm

    if (deleteAliases) {
      // Calculate new sizes array (with size removed)
      const newSizes = sizes.filter(s => s !== size)
      const aliasRawSizes = affectedAliases.map(a => a.raw)

      // Delete aliases AND save size order in a single atomic transaction
      startTransition(async () => {
        const result = await removeCanonicalSizeWithAliases(aliasRawSizes, newSizes)

        if (result.success) {
          // Update local state to match DB
          setAliases(prev => prev.filter(
            a => !affectedAliases.some(affected => affected.raw === a.raw)
          ))
          setSizes(newSizes)
          setOriginalSizes(newSizes) // Reset baseline so hasChanges = false
          setRemoveConfirm(null)
          setStatus({ kind: 'success', message: result.message ?? 'Removed.' })
        } else {
          // Transaction failed - nothing was changed
          setRemoveConfirm(null)
          setStatus({ kind: 'error', message: result.error })
        }
      })
    } else {
      // Just remove the size locally, leave aliases orphaned (user's choice)
      // User must still click Save to persist
      setSizes(prev => prev.filter(s => s !== size))
      setRemoveConfirm(null)
    }
  }

  function handleSave() {
    setStatus(null)
    startTransition(async () => {
      const result = await updateSizeOrderConfig(sizes)
      if (result.success) {
        setOriginalSizes(sizes) // Reset baseline so hasChanges becomes false
        setStatus({ kind: 'success', message: result.message ?? 'Saved.' })
      } else {
        setStatus({ kind: 'error', message: result.error })
      }
    })
  }

  function handleOpenAliasModal(alias?: SizeAlias) {
    if (alias) {
      setEditingAlias(alias)
      setNewAliasRaw(alias.raw)
      setNewAliasCanonical(alias.canonical)
    } else {
      setEditingAlias(null)
      setNewAliasRaw('')
      setNewAliasCanonical('')
    }
    setShowAliasModal(true)
  }

  function handleSaveAlias() {
    if (!newAliasRaw || !newAliasCanonical) return

    startTransition(async () => {
      const result = await upsertSizeAlias(newAliasRaw, newAliasCanonical)
      if (result.success) {
        // Update local state
        setAliases(prev => {
          const existing = prev.findIndex(a => a.raw === newAliasRaw)
          if (existing >= 0) {
            const updated = [...prev]
            updated[existing] = { raw: newAliasRaw, canonical: newAliasCanonical }
            return updated
          }
          return [...prev, { raw: newAliasRaw, canonical: newAliasCanonical }]
        })
        setShowAliasModal(false)
        setStatus({ kind: 'success', message: 'Alias saved.' })
      } else {
        setStatus({ kind: 'error', message: result.error })
      }
    })
  }

  function handleDeleteAlias(raw: string) {
    startTransition(async () => {
      const result = await deleteSizeAlias(raw)
      if (result.success) {
        setAliases(prev => prev.filter(a => a.raw !== raw))
        setStatus({ kind: 'success', message: 'Alias deleted.' })
      } else {
        setStatus({ kind: 'error', message: result.error })
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Size Mapping and Order</CardTitle>
        <CardDescription>
          Map raw Shopify sizes to canonical sizes, then define the sort order. SKUs with missing sizes will appear in the Missing Sizes panel.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 1. Missing Sizes Section */}
        {missingSizeSkus.length > 0 && (
          <div className="space-y-3 p-4 rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                <h3 className="text-sm font-medium text-red-700 dark:text-red-400">
                  Missing Sizes ({missingSizeSkus.length} SKUs)
                </h3>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowMissingModal(true)}
              >
                View Details
              </Button>
            </div>
            <p className="text-xs text-red-600 dark:text-red-400">
              These SKUs have no size metafield set in Shopify. Fix them in Shopify and run a sync.
            </p>
          </div>
        )}

        {/* 2. Unmapped Sizes Section */}
        {unmappedSizes.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-500" />
              <h3 className="text-sm font-medium">
                Unmapped Sizes ({unmappedSizes.length})
              </h3>
            </div>
            <p className="text-xs text-muted-foreground">
              These sizes exist in Shopify but are not in your sort order. Click to add them.
            </p>
            <div className="flex flex-wrap gap-2">
              {unmappedSizes.map((item) => (
                <SizeChip
                  key={item.size}
                  size={item.size}
                  count={item.count}
                  onAdd={handleAddSize}
                />
              ))}
            </div>
          </div>
        )}

        {/* 3. Aliases Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-blue-500" />
              <h3 className="text-sm font-medium">
                Size Aliases ({aliases.length})
              </h3>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={hasChanges ? 0 : -1}>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleOpenAliasModal()}
                    disabled={hasChanges}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add Alias
                  </Button>
                </span>
              </TooltipTrigger>
              {hasChanges && (
                <TooltipContent>
                  Save size order first
                </TooltipContent>
              )}
            </Tooltip>
          </div>
          <p className="text-xs text-muted-foreground">
            Map format variants to a canonical size for sorting. E.g., &quot;XS/S (6-8)&quot; → &quot;XS/S(6-8)&quot;
          </p>
          {aliases.length > 0 ? (
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Raw Size</th>
                    <th className="px-3 py-2 text-left font-medium">→</th>
                    <th className="px-3 py-2 text-left font-medium">Canonical Size</th>
                    <th className="px-3 py-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {aliases.map((alias) => {
                    const isOrphaned = !sizes.some(
                      s => s.toUpperCase() === alias.canonical.toUpperCase()
                    )
                    return (
                    <tr key={alias.raw} className={`border-t ${isOrphaned ? 'bg-red-50 dark:bg-red-900/10' : ''}`}>
                      <td className="px-3 py-2 font-mono text-sm">{alias.raw}</td>
                      <td className="px-3 py-2 text-muted-foreground">→</td>
                      <td className="px-3 py-2 font-mono text-sm">
                        <span className="inline-flex items-center gap-1.5">
                          {alias.canonical}
                          {isOrphaned && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                              </TooltipTrigger>
                              <TooltipContent>
                                Canonical size not in mapped order — sorting will fail
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span tabIndex={hasChanges ? 0 : -1}>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => handleOpenAliasModal(alias)}
                                disabled={hasChanges}
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                            </span>
                          </TooltipTrigger>
                          {hasChanges && (
                            <TooltipContent>
                              Save size order first
                            </TooltipContent>
                          )}
                        </Tooltip>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          onClick={() => handleDeleteAlias(alias.raw)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4 border rounded-lg">
              No aliases defined. Aliases let you map format variants to a canonical size.
            </p>
          )}
        </div>

        {/* 4. Mapped Order Section */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium">
            Mapped Order ({sizes.length} sizes)
          </h3>
          <div className="max-h-[400px] overflow-y-auto rounded-lg border border-border bg-muted/30 p-2">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={sizes} strategy={verticalListSortingStrategy}>
                <div className="space-y-1">
                  {sizes.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No sizes mapped. Add sizes from the unmapped list above.
                    </p>
                  ) : (
                    sizes.map((size) => (
                      <SortableItem
                        key={size}
                        id={size}
                        count={sizeCountMap.get(size.toUpperCase())}
                        onRemove={handleRemoveSize}
                      />
                    ))
                  )}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
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
      </CardContent>

      {/* Missing Sizes Modal */}
      <Dialog open={showMissingModal} onOpenChange={setShowMissingModal}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Missing Size SKUs</DialogTitle>
            <DialogDescription>
              These SKUs have no size metafield in Shopify. Set the custom.size metafield in Shopify Admin, then run a sync.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">SKU ID</th>
                  <th className="px-3 py-2 text-left font-medium">Shopify Variant ID</th>
                  <th className="px-3 py-2 text-left font-medium">Description</th>
                </tr>
              </thead>
              <tbody>
                {missingSizeSkus.map((sku) => (
                  <tr key={sku.skuId} className="border-t">
                    <td className="px-3 py-2 font-mono">{sku.skuId}</td>
                    <td className="px-3 py-2 font-mono text-xs">{sku.shopifyVariantId || '-'}</td>
                    <td className="px-3 py-2 text-sm">{sku.description || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMissingModal(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Alias Modal */}
      <Dialog open={showAliasModal} onOpenChange={setShowAliasModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingAlias ? 'Edit Alias' : 'Add Alias'}</DialogTitle>
            <DialogDescription>
              Map a raw Shopify size to a canonical size for sorting purposes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Raw Size (from Shopify)</label>
              <Select
                value={newAliasRaw}
                onValueChange={setNewAliasRaw}
                disabled={!!editingAlias}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a size..." />
                </SelectTrigger>
                <SelectContent>
                  {distinctSizes.map((d) => (
                    <SelectItem key={d.size} value={d.size}>
                      {d.size} ({d.count} SKUs)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Canonical Size (maps to)</label>
              <Select
                value={newAliasCanonical}
                onValueChange={setNewAliasCanonical}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select canonical size..." />
                </SelectTrigger>
                <SelectContent>
                  {sizes.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAliasModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveAlias}
              disabled={!newAliasRaw || !newAliasCanonical || isPending}
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Alias'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Size Confirmation Modal */}
      <Dialog open={!!removeConfirm} onOpenChange={(open) => !open && setRemoveConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Size with Aliases</DialogTitle>
            <DialogDescription>
              <span className="font-mono bg-muted px-1.5 py-0.5 rounded">{removeConfirm?.size}</span> is used as the canonical size for {removeConfirm?.affectedAliases.length} alias(es):
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <ul className="space-y-1 text-sm">
              {removeConfirm?.affectedAliases.map(alias => (
                <li key={alias.raw} className="font-mono text-muted-foreground">
                  {alias.raw} → {alias.canonical}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-muted-foreground">
              Removing this size will break sorting for SKUs matched by these aliases.
            </p>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setRemoveConfirm(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => handleConfirmRemove(true)}
              disabled={isPending}
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Removing...
                </>
              ) : (
                `Remove & Delete Alias${removeConfirm?.affectedAliases.length === 1 ? '' : 'es'}`
              )}
            </Button>
            <Button
              variant="secondary"
              onClick={() => handleConfirmRemove(false)}
            >
              Remove Anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
