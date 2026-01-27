'use client'

import { useState, useTransition, useEffect, useMemo } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverEvent,
  DragOverlay,
  closestCorners,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { 
  updateSizeOrderConfig, 
  upsertSizeAlias, 
  upsertSizeAliasWithCustomCanonical, 
  deleteSizeAlias, 
  removeCanonicalSizeWithAliases,
  validateSize,
  unvalidateSize,
  removeMemberFromGroup,
} from '@/lib/data/actions/settings'
import { X, Loader2, Plus, AlertTriangle, Users, Pencil, Trash2, Check } from 'lucide-react'

// =============================================================================
// Types
// =============================================================================

interface DistinctSize {
  size: string
  count: number
}

interface SizeAlias {
  raw: string
  canonical: string
}

interface SizeOrderConfigProps {
  initialSizes: string[]
  initialValidatedSizes: string[]
  distinctSizes: DistinctSize[]
  aliases: SizeAlias[]
}

// Unified pill types
type UnifiedPill = 
  | { type: 'green'; name: string; count: number; isCustom: boolean }
  | { type: 'blue'; name: string; count: number; isCustom: boolean; members: string[] }
  | { type: 'amber'; name: string; count: number }

// =============================================================================
// Unified Pill Component
// =============================================================================

function UnifiedPillComponent({
  pill,
  validatedSizes,
  sizeCountMap,
  isPending,
  isDropTarget,
  onValidate,
  onUnvalidate,
  onRemoveCanonical,
  onAddToGroup,
  onRemoveMember,
}: {
  pill: UnifiedPill
  validatedSizes: string[]
  sizeCountMap: Map<string, number>
  isPending: boolean
  isDropTarget: boolean
  onValidate: (name: string) => void
  onUnvalidate: (name: string) => void
  onRemoveCanonical: (name: string) => void
  onAddToGroup: (raw: string, canonical: string) => void
  onRemoveMember: (raw: string, canonical: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [selectedCanonical, setSelectedCanonical] = useState('')
  
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: pill.name })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  // Color classes based on pill type
  const colorClasses = {
    green: 'bg-emerald-50 border-emerald-300 dark:bg-emerald-900/20 dark:border-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-900/40',
    blue: 'bg-blue-50 border-blue-300 dark:bg-blue-900/20 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900/40',
    amber: 'bg-amber-50 border-amber-300 dark:bg-amber-900/20 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/40',
  }

  const countClasses = {
    green: 'text-emerald-600 dark:text-emerald-400',
    blue: 'text-blue-600 dark:text-blue-400',
    amber: 'text-amber-600 dark:text-amber-400',
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div
          ref={setNodeRef}
          style={style}
          className={`
            inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border
            text-sm font-mono cursor-grab active:cursor-grabbing
            ${colorClasses[pill.type]}
            ${isDragging ? 'opacity-50 pointer-events-none' : ''}
            ${isDropTarget ? 'ml-8 ring-2 ring-primary/50' : 'ml-0'}
            transition-all duration-150 ease-out
          `}
          {...attributes}
          {...listeners}
        >
          {pill.type === 'amber' && <Plus className="h-3 w-3 text-amber-600 dark:text-amber-400" />}
          {pill.type === 'blue' && <Users className="h-3 w-3 text-blue-600 dark:text-blue-400" />}
          {pill.type === 'green' && <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />}
          <span>{pill.name}</span>
          {pill.type !== 'amber' && pill.isCustom && (
            <span className="text-amber-500">★</span>
          )}
          <span className={`text-xs ${countClasses[pill.type]}`}>({pill.count})</span>
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-72">
        {/* GREEN PILL POPOVER */}
        {pill.type === 'green' && (
          <div className="space-y-3">
            <div>
              <p className="font-mono text-sm font-medium">{pill.name}</p>
              <p className="text-xs text-muted-foreground">{pill.count} SKUs</p>
              {pill.isCustom && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">★ Custom size (not from Shopify)</p>
              )}
            </div>
            <div className="space-y-2">
              <Button
                className="w-full"
                variant="outline"
                disabled={isPending}
                onClick={() => {
                  onUnvalidate(pill.name)
                  setOpen(false)
                }}
              >
                Mark as unvalidated
              </Button>
              <Button
                className="w-full"
                variant="outline"
                disabled={isPending}
                onClick={() => {
                  onRemoveCanonical(pill.name)
                  setOpen(false)
                }}
              >
                Remove from order
              </Button>
            </div>
          </div>
        )}

        {/* BLUE PILL POPOVER */}
        {pill.type === 'blue' && (
          <div className="space-y-3">
            <div>
              <p className="font-mono text-sm font-medium">{pill.name}</p>
              <p className="text-xs text-muted-foreground">{pill.count} SKUs total</p>
              {pill.isCustom && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">★ Custom size (not from Shopify)</p>
              )}
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Group members:</p>
              <div className="rounded-md border divide-y max-h-32 overflow-y-auto">
                {pill.members.map(member => {
                  const memberCount = sizeCountMap.get(member.toUpperCase()) ?? 0
                  return (
                    <div key={member} className="flex items-center justify-between px-2 py-1.5 text-xs font-mono">
                      <span className="truncate flex-1">{member}</span>
                      <span className="text-muted-foreground mx-2">({memberCount})</span>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-destructive"
                        disabled={isPending}
                        onClick={() => onRemoveMember(member, pill.name)}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="space-y-2">
              <Button
                className="w-full"
                variant="outline"
                disabled={isPending}
                onClick={() => {
                  onUnvalidate(pill.name)
                  setOpen(false)
                }}
              >
                Mark as unvalidated
              </Button>
              <Button
                className="w-full"
                variant="outline"
                disabled={isPending}
                onClick={() => {
                  onRemoveCanonical(pill.name)
                  setOpen(false)
                }}
              >
                Remove canonical
              </Button>
            </div>
          </div>
        )}

        {/* AMBER PILL POPOVER */}
        {pill.type === 'amber' && (
          <div className="space-y-4">
            <div>
              <p className="font-mono text-sm font-medium">{pill.name}</p>
              <p className="text-xs text-muted-foreground">{pill.count} SKUs</p>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">Not yet validated</p>
            </div>

            <Button
              className="w-full"
              variant="default"
              disabled={isPending}
              onClick={() => {
                onValidate(pill.name)
                setOpen(false)
              }}
            >
              <Check className="h-3 w-3 mr-1" />
              Validate
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-popover px-2 text-muted-foreground">or</span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Add to group:</label>
              <Select value={selectedCanonical} onValueChange={setSelectedCanonical}>
                <SelectTrigger>
                  <SelectValue placeholder="Select validated size..." />
                </SelectTrigger>
                <SelectContent>
                  {validatedSizes.map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                className="w-full"
                disabled={!selectedCanonical || isPending}
                onClick={() => {
                  onAddToGroup(pill.name, selectedCanonical)
                  setOpen(false)
                  setSelectedCanonical('')
                }}
              >
                Add to Group
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

// =============================================================================
// Pill Overlay (for DragOverlay)
// =============================================================================

function PillOverlay({ pill }: { pill: UnifiedPill | null }) {
  if (!pill) return null

  const colorClasses = {
    green: 'bg-emerald-50 border-emerald-300 dark:bg-emerald-900/20 dark:border-emerald-700',
    blue: 'bg-blue-50 border-blue-300 dark:bg-blue-900/20 dark:border-blue-700',
    amber: 'bg-amber-50 border-amber-300 dark:bg-amber-900/20 dark:border-amber-700',
  }

  const countClasses = {
    green: 'text-emerald-600 dark:text-emerald-400',
    blue: 'text-blue-600 dark:text-blue-400',
    amber: 'text-amber-600 dark:text-amber-400',
  }

  return (
    <div
      className={`
        inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border
        text-sm font-mono cursor-grabbing shadow-lg
        ${colorClasses[pill.type]}
      `}
    >
      {pill.type === 'amber' && <Plus className="h-3 w-3 text-amber-600 dark:text-amber-400" />}
      {pill.type === 'blue' && <Users className="h-3 w-3 text-blue-600 dark:text-blue-400" />}
      {pill.type === 'green' && <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />}
      <span>{pill.name}</span>
      {pill.type !== 'amber' && pill.isCustom && (
        <span className="text-amber-500">★</span>
      )}
      <span className={`text-xs ${countClasses[pill.type]}`}>({pill.count})</span>
    </div>
  )
}

// =============================================================================
// Main Component
// =============================================================================

export function SizeOrderConfig({ 
  initialSizes, 
  initialValidatedSizes,
  distinctSizes, 
  aliases: initialAliases 
}: SizeOrderConfigProps) {
  const [sizes, setSizes] = useState<string[]>(initialSizes)
  const [originalSizes, setOriginalSizes] = useState<string[]>(initialSizes)
  const [validatedSizesSet, setValidatedSizesSet] = useState<Set<string>>(
    () => new Set(initialValidatedSizes.map(s => s.toUpperCase()))
  )
  const [originalValidatedSizes, setOriginalValidatedSizes] = useState<string[]>(initialValidatedSizes)
  const [aliases, setAliases] = useState<SizeAlias[]>(initialAliases)
  const [isPending, startTransition] = useTransition()
  const [status, setStatus] = useState<{ kind: 'success' | 'error'; message: string } | null>(null)

  // Modal states
  const [showAliasModal, setShowAliasModal] = useState(false)
  const [editingAlias, setEditingAlias] = useState<SizeAlias | null>(null)
  const [newAliasRaw, setNewAliasRaw] = useState('')
  const [newAliasCanonical, setNewAliasCanonical] = useState('')
  const [useCustomCanonical, setUseCustomCanonical] = useState(false)
  const [customCanonicalInput, setCustomCanonicalInput] = useState('')

  // Remove confirmation state
  const [removeConfirm, setRemoveConfirm] = useState<{
    size: string
    affectedAliases: SizeAlias[]
  } | null>(null)

  // Delete alias confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  // Add custom size modal state
  const [showAddCustomModal, setShowAddCustomModal] = useState(false)
  const [customSizeInput, setCustomSizeInput] = useState('')

  // Drag overlay state
  const [activeId, setActiveId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)

  // Sensors with touch support
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // =============================================================================
  // Memoized Computations
  // =============================================================================

  // Create a lookup for counts
  const sizeCountMap = useMemo(
    () => new Map(distinctSizes.map(d => [d.size.toUpperCase(), d.count])),
    [distinctSizes]
  )

  // Track Shopify sizes for custom detection
  const shopifySizes = useMemo(
    () => new Set(distinctSizes.map(d => d.size.toUpperCase())),
    [distinctSizes]
  )

  // Compute canonical counts (direct + aliased SKUs)
  const canonicalCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const size of sizes) {
      const upper = size.toUpperCase()
      const direct = sizeCountMap.get(upper) ?? 0
      const aliased = aliases
        .filter(a => a.canonical.toUpperCase() === upper)
        .reduce((sum, a) => sum + (sizeCountMap.get(a.raw.toUpperCase()) ?? 0), 0)
      counts.set(size, direct + aliased)
    }
    return counts
  }, [sizes, aliases, sizeCountMap])

  // Compute members for each canonical (aliases pointing to it)
  const canonicalMembers = useMemo(() => {
    const members = new Map<string, string[]>()
    for (const size of sizes) {
      const upper = size.toUpperCase()
      const aliasMembers = aliases
        .filter(a => a.canonical.toUpperCase() === upper)
        .map(a => a.raw)
      members.set(size, aliasMembers)
    }
    return members
  }, [sizes, aliases])

  // Get validated sizes as array (for dropdown)
  const validatedSizesArray = useMemo(() => {
    return sizes.filter(s => validatedSizesSet.has(s.toUpperCase()))
  }, [sizes, validatedSizesSet])

  // =============================================================================
  // UNIFIED PILLS - The key computation
  // =============================================================================
  const unifiedPills = useMemo((): UnifiedPill[] => {
    const result: UnifiedPill[] = []
    const sizesUpperSet = new Set(sizes.map(s => s.toUpperCase()))
    const aliasedRaws = new Set(aliases.map(a => a.raw.toUpperCase()))

    // 1. Add all sizes from saved order (green/blue/amber based on validation)
    for (const size of sizes) {
      const upper = size.toUpperCase()
      const isValidated = validatedSizesSet.has(upper)
      const members = canonicalMembers.get(size) ?? []
      const count = canonicalCounts.get(size) ?? 0
      const isCustom = !shopifySizes.has(upper)

      if (!isValidated) {
        // Amber - not validated
        result.push({ type: 'amber', name: size, count })
      } else if (members.length > 0) {
        // Blue - validated with aliases
        result.push({ type: 'blue', name: size, count, isCustom, members })
      } else {
        // Green - validated, no aliases
        result.push({ type: 'green', name: size, count, isCustom })
      }
    }

    // 2. Add NEW Shopify sizes not in saved order AND not aliased
    for (const d of distinctSizes) {
      const upper = d.size.toUpperCase()
      if (!sizesUpperSet.has(upper) && !aliasedRaws.has(upper)) {
        // This is a NEW size from Shopify - add as amber at the end
        result.push({ type: 'amber', name: d.size, count: d.count })
      }
    }

    return result
  }, [sizes, validatedSizesSet, canonicalMembers, canonicalCounts, shopifySizes, distinctSizes, aliases])

  // Get pill by ID
  const getPillById = (id: string): UnifiedPill | null => {
    return unifiedPills.find(p => p.name === id) ?? null
  }

  // Track if there are unsaved changes
  const hasChanges = JSON.stringify(sizes) !== JSON.stringify(originalSizes)

  // =============================================================================
  // Effects
  // =============================================================================

  // Clear status after a few seconds
  useEffect(() => {
    if (status?.kind === 'success') {
      const timer = setTimeout(() => setStatus(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [status])

  // Warn before navigating away with unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasChanges) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [hasChanges])

  // =============================================================================
  // Drag Handlers
  // =============================================================================

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string)
  }

  function handleDragOver(event: DragOverEvent) {
    setOverId(event.over?.id as string ?? null)
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null)
    setOverId(null)
    const { active, over } = event
    if (!over || active.id === over.id) return

    const activeId = active.id as string
    const overId = over.id as string
    const oldIndex = sizes.indexOf(activeId)
    const newIndex = sizes.indexOf(overId)

    let newSizes: string[] | null = null

    if (oldIndex !== -1 && newIndex !== -1) {
      // Both in sizes - reorder
      newSizes = arrayMove(sizes, oldIndex, newIndex)
    } else if (oldIndex === -1 && newIndex !== -1) {
      // NEW size being dragged (from distinctSizes, not yet in sizes) - insert at new position
      newSizes = [...sizes]
      newSizes.splice(newIndex, 0, activeId)
    } else if (oldIndex === -1 && newIndex === -1) {
      // Both are new sizes - just add the active one at the end of saved sizes
      newSizes = [...sizes, activeId]
    }

    if (newSizes) {
      // Update local state immediately for responsiveness
      setSizes(newSizes)

      // Auto-save to server
      const validatedArray = newSizes.filter(s => validatedSizesSet.has(s.toUpperCase()))
      startTransition(async () => {
        const result = await updateSizeOrderConfig(newSizes!, validatedArray)
        if (result.success) {
          setOriginalSizes(newSizes!)
          setStatus({ kind: 'success', message: 'Order saved.' })
        } else {
          setStatus({ kind: 'error', message: result.error })
        }
      })
    }
  }

  // =============================================================================
  // Action Handlers
  // =============================================================================

  function handleValidate(size: string) {
    startTransition(async () => {
      const result = await validateSize(size)
      if (result.success) {
        setValidatedSizesSet(prev => new Set([...prev, size.toUpperCase()]))
        setStatus({ kind: 'success', message: result.message ?? 'Validated.' })
      } else {
        setStatus({ kind: 'error', message: result.error })
      }
    })
  }

  function handleUnvalidate(size: string) {
    startTransition(async () => {
      const result = await unvalidateSize(size)
      if (result.success) {
        setValidatedSizesSet(prev => {
          const newSet = new Set(prev)
          newSet.delete(size.toUpperCase())
          return newSet
        })
        // Also remove any aliases that pointed to this size
        setAliases(prev => prev.filter(a => a.canonical.toUpperCase() !== size.toUpperCase()))
        setStatus({ kind: 'success', message: result.message ?? 'Unvalidated.' })
      } else {
        setStatus({ kind: 'error', message: result.error })
      }
    })
  }

  function handleRemoveSize(id: string) {
    const affectedAliases = aliases.filter(
      a => a.canonical.toUpperCase() === id.toUpperCase()
    )

    if (affectedAliases.length > 0) {
      // Has aliases - show confirmation dialog
      setRemoveConfirm({ size: id, affectedAliases })
    } else {
      // No aliases - remove and auto-save
      const newSizes = sizes.filter((s) => s !== id)
      const newValidatedSet = new Set(validatedSizesSet)
      newValidatedSet.delete(id.toUpperCase())

      // Update local state
      setSizes(newSizes)
      setValidatedSizesSet(newValidatedSet)

      // Auto-save to server
      const validatedArray = newSizes.filter(s => newValidatedSet.has(s.toUpperCase()))
      startTransition(async () => {
        const result = await updateSizeOrderConfig(newSizes, validatedArray)
        if (result.success) {
          setOriginalSizes(newSizes)
          setStatus({ kind: 'success', message: 'Size removed.' })
        } else {
          setStatus({ kind: 'error', message: result.error })
        }
      })
    }
  }

  function handleConfirmRemove(deleteAliases: boolean) {
    if (!removeConfirm) return
    const { size, affectedAliases } = removeConfirm

    if (deleteAliases) {
      const newSizes = sizes.filter(s => s !== size)
      const aliasRawSizes = affectedAliases.map(a => a.raw)
      const newValidated = Array.from(validatedSizesSet)
        .filter(s => s.toUpperCase() !== size.toUpperCase())
        .map(s => sizes.find(sz => sz.toUpperCase() === s) ?? s)

      startTransition(async () => {
        const result = await removeCanonicalSizeWithAliases(aliasRawSizes, newSizes)
        if (result.success) {
          setAliases(prev => prev.filter(
            a => !affectedAliases.some(affected => affected.raw === a.raw)
          ))
          setSizes(newSizes)
          setOriginalSizes(newSizes)
          setValidatedSizesSet(prev => {
            const newSet = new Set(prev)
            newSet.delete(size.toUpperCase())
            return newSet
          })
          setRemoveConfirm(null)
          setStatus({ kind: 'success', message: result.message ?? 'Removed.' })
        } else {
          setRemoveConfirm(null)
          setStatus({ kind: 'error', message: result.error })
        }
      })
    } else {
      setSizes(prev => prev.filter(s => s !== size))
      setValidatedSizesSet(prev => {
        const newSet = new Set(prev)
        newSet.delete(size.toUpperCase())
        return newSet
      })
      setRemoveConfirm(null)
    }
  }

  function handleSave() {
    setStatus(null)
    const validatedArray = sizes.filter(s => validatedSizesSet.has(s.toUpperCase()))
    startTransition(async () => {
      const result = await updateSizeOrderConfig(sizes, validatedArray)
      if (result.success) {
        setOriginalSizes(sizes)
        setOriginalValidatedSizes(validatedArray)
        setStatus({ kind: 'success', message: result.message ?? 'Saved.' })
      } else {
        setStatus({ kind: 'error', message: result.error })
      }
    })
  }

  function handleAddToGroup(raw: string, canonical: string) {
    startTransition(async () => {
      const result = await upsertSizeAlias(raw, canonical)
      if (result.success) {
        // Update aliases locally
        setAliases(prev => {
          const existing = prev.findIndex(a => a.raw === raw)
          if (existing >= 0) {
            const updated = [...prev]
            updated[existing] = { raw, canonical }
            return updated
          }
          return [...prev, { raw, canonical }]
        })

        // Check if raw size was in the saved sizes array
        const rawInSizes = sizes.includes(raw)
        if (rawInSizes) {
          // Remove from sizes and persist to server
          const newSizes = sizes.filter(s => s !== raw)
          const newValidatedArray = Array.from(validatedSizesSet)
            .filter(v => v !== raw.toUpperCase())
            .map(v => sizes.find(s => s.toUpperCase() === v) ?? v)

          const saveResult = await updateSizeOrderConfig(newSizes, newValidatedArray)
          if (saveResult.success) {
            setSizes(newSizes)
            setOriginalSizes(newSizes)
            setValidatedSizesSet(prev => {
              const newSet = new Set(prev)
              newSet.delete(raw.toUpperCase())
              return newSet
            })
          }
        }
        // If raw wasn't in sizes (was a new Shopify size), no need to update sizes array

        setStatus({ kind: 'success', message: 'Added to group.' })
      } else {
        setStatus({ kind: 'error', message: result.error })
      }
    })
  }

  function handleRemoveMember(rawSize: string, canonicalSize: string) {
    startTransition(async () => {
      const result = await removeMemberFromGroup(rawSize, canonicalSize)
      if (result.success) {
        // Update local state: remove alias
        setAliases(prev => prev.filter(a => a.raw !== rawSize))
        // Insert rawSize right after canonical
        const canonicalIndex = sizes.indexOf(canonicalSize)
        if (canonicalIndex !== -1) {
          const newSizes = [...sizes]
          newSizes.splice(canonicalIndex + 1, 0, rawSize)
          setSizes(newSizes)
        } else {
          // Fallback: add to end
          setSizes(prev => [...prev, rawSize])
        }
        // Do NOT add to validatedSizes - it's amber
        setStatus({ kind: 'success', message: 'Removed from group.' })
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
      const isCustom = !sizes.some(s => s.toUpperCase() === alias.canonical.toUpperCase())
      setUseCustomCanonical(isCustom)
      setCustomCanonicalInput(isCustom ? alias.canonical : '')
    } else {
      setEditingAlias(null)
      setNewAliasRaw('')
      setNewAliasCanonical('')
      setUseCustomCanonical(false)
      setCustomCanonicalInput('')
    }
    setShowAliasModal(true)
  }

  function handleSaveAlias() {
    const canonicalValue = useCustomCanonical ? customCanonicalInput.trim() : newAliasCanonical
    if (!newAliasRaw || !canonicalValue) return

    startTransition(async () => {
      const needsCustomCanonical = useCustomCanonical && 
        canonicalValue && 
        !sizes.some(s => s.toUpperCase() === canonicalValue.toUpperCase())

      if (needsCustomCanonical) {
        const result = await upsertSizeAliasWithCustomCanonical(
          newAliasRaw,
          canonicalValue,
          sizes
        )
        if (result.success) {
          const newSizes = [...sizes, canonicalValue]
          setSizes(newSizes)
          setOriginalSizes(newSizes)
          // Add the new custom canonical to validated
          setValidatedSizesSet(prev => new Set([...prev, canonicalValue.toUpperCase()]))
          setAliases(prev => {
            const existing = prev.findIndex(a => a.raw === newAliasRaw)
            if (existing >= 0) {
              const updated = [...prev]
              updated[existing] = { raw: newAliasRaw, canonical: canonicalValue }
              return updated
            }
            return [...prev, { raw: newAliasRaw, canonical: canonicalValue }]
          })
          setShowAliasModal(false)
          setStatus({ kind: 'success', message: result.message ?? 'Saved.' })
        } else {
          setStatus({ kind: 'error', message: result.error })
        }
      } else {
        const result = await upsertSizeAlias(newAliasRaw, canonicalValue)
        if (result.success) {
          setAliases(prev => {
            const existing = prev.findIndex(a => a.raw === newAliasRaw)
            if (existing >= 0) {
              const updated = [...prev]
              updated[existing] = { raw: newAliasRaw, canonical: canonicalValue }
              return updated
            }
            return [...prev, { raw: newAliasRaw, canonical: canonicalValue }]
          })
          setShowAliasModal(false)
          setStatus({ kind: 'success', message: 'Alias saved.' })
        } else {
          setStatus({ kind: 'error', message: result.error })
        }
      }
    })
  }

  function handleDeleteAlias(raw: string) {
    setDeleteConfirm(raw)
  }

  function confirmDeleteAlias() {
    if (!deleteConfirm) return
    const raw = deleteConfirm
    setDeleteConfirm(null)

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

  function handleAddCustomSize() {
    const trimmed = customSizeInput.trim()
    if (!trimmed) return

    if (sizes.some(s => s.toUpperCase() === trimmed.toUpperCase())) {
      setStatus({ kind: 'error', message: `Size "${trimmed}" already exists` })
      return
    }

    const sizeToAdd = distinctSizes.find(d => d.size.toUpperCase() === trimmed.toUpperCase())?.size ?? trimmed
    const newSizes = [...sizes, sizeToAdd]
    const newValidatedSet = new Set([...validatedSizesSet, sizeToAdd.toUpperCase()])

    // Update local state immediately
    setSizes(newSizes)
    setValidatedSizesSet(newValidatedSet)
    setCustomSizeInput('')
    setShowAddCustomModal(false)

    // Auto-save to server
    const validatedArray = newSizes.filter(s => newValidatedSet.has(s.toUpperCase()))
    startTransition(async () => {
      const result = await updateSizeOrderConfig(newSizes, validatedArray)
      if (result.success) {
        setOriginalSizes(newSizes)
        setStatus({ kind: 'success', message: 'Custom size added.' })
      } else {
        setStatus({ kind: 'error', message: result.error })
      }
    })
  }

  // =============================================================================
  // Render
  // =============================================================================

  const activePill = activeId ? getPillById(activeId) : null
  const greenCount = unifiedPills.filter(p => p.type === 'green').length
  const blueCount = unifiedPills.filter(p => p.type === 'blue').length
  const amberCount = unifiedPills.filter(p => p.type === 'amber').length

  return (
    <Card>
      <CardHeader>
        <CardTitle>Size Order</CardTitle>
        <CardDescription>
          Drag to reorder. Green = validated, Blue = group with members, Amber = pending validation.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Summary stats and actions */}
        <div className="flex items-center justify-between pb-2 border-b">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              {greenCount} Validated
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
              {blueCount} Groups
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              {amberCount} Pending
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddCustomModal(true)}
              disabled={isPending}
            >
              <Plus className="h-3 w-3 mr-1" />
              Add Custom
            </Button>
          </div>
        </div>

        {/* Unified Pill Grid */}
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          {unifiedPills.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No sizes to display.
            </p>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCorners}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={unifiedPills.map(p => p.name)}
                strategy={rectSortingStrategy}
              >
                <div className="flex flex-wrap gap-2">
                  {unifiedPills.map((pill) => (
                    <UnifiedPillComponent
                      key={pill.name}
                      pill={pill}
                      validatedSizes={validatedSizesArray}
                      sizeCountMap={sizeCountMap}
                      isPending={isPending}
                      isDropTarget={overId === pill.name && activeId !== pill.name}
                      onValidate={handleValidate}
                      onUnvalidate={handleUnvalidate}
                      onRemoveCanonical={handleRemoveSize}
                      onAddToGroup={handleAddToGroup}
                      onRemoveMember={handleRemoveMember}
                    />
                  ))}
                </div>
              </SortableContext>
              <DragOverlay>
                <PillOverlay pill={activePill} />
              </DragOverlay>
            </DndContext>
          )}
        </div>

        {/* Empty state for pending */}
        {amberCount === 0 && sizes.length > 0 && (
          <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
            <Check className="h-4 w-4" />
            <span>All sizes are validated!</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-2 border-t">
          <div className="text-sm text-muted-foreground">
            {hasChanges ? (
              <span className="text-amber-600 dark:text-amber-400">Unsaved changes</span>
            ) : status?.kind === 'success' ? (
              <span className="text-emerald-600 dark:text-emerald-400">{status.message}</span>
            ) : status?.kind === 'error' ? (
              <span className="text-destructive">{status.message}</span>
            ) : (
              <span>All changes saved</span>
            )}
            {!hasChanges && status?.kind !== 'error' && (
              <span className="block text-xs text-muted-foreground/70 mt-0.5">
                Product pages will reflect changes on next load
              </span>
            )}
          </div>
          <Button onClick={handleSave} disabled={!hasChanges || isPending}>
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

        {/* Aliases Table (Reference) */}
        {aliases.length > 0 && (
          <div className="space-y-3 pt-4 border-t">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Aliases Reference ({aliases.length})</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleOpenAliasModal()}
                disabled={isPending}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add Alias
              </Button>
            </div>
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
                    ) || !validatedSizesSet.has(alias.canonical.toUpperCase())
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
                                  Canonical size not validated — sorting may fail
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => handleOpenAliasModal(alias)}
                            disabled={isPending}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                            onClick={() => handleDeleteAlias(alias.raw)}
                            disabled={isPending}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>

      {/* Remove Confirmation Dialog */}
      <Dialog open={!!removeConfirm} onOpenChange={() => setRemoveConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Size</DialogTitle>
            <DialogDescription>
              The size &quot;{removeConfirm?.size}&quot; has {removeConfirm?.affectedAliases.length} alias(es) pointing to it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <p className="text-sm font-medium">Affected aliases:</p>
            <ul className="text-sm text-muted-foreground list-disc list-inside">
              {removeConfirm?.affectedAliases.map(a => (
                <li key={a.raw} className="font-mono">{a.raw}</li>
              ))}
            </ul>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setRemoveConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={() => handleConfirmRemove(false)}
            >
              Remove (keep orphaned aliases)
            </Button>
            <Button
              variant="destructive"
              onClick={() => handleConfirmRemove(true)}
              disabled={isPending}
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Remove + delete aliases'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Alias Confirmation Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Alias</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the alias for &quot;{deleteConfirm}&quot;?
              The size will reappear as pending validation.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteAlias}
              disabled={isPending}
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Custom Size Modal */}
      <Dialog open={showAddCustomModal} onOpenChange={setShowAddCustomModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Custom Size</DialogTitle>
            <DialogDescription>
              Create a validated size that doesn&apos;t exist in Shopify.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="e.g., M/L(7-16)"
              value={customSizeInput}
              onChange={(e) => setCustomSizeInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddCustomSize()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddCustomModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddCustomSize} disabled={!customSizeInput.trim()}>
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Alias Modal */}
      <Dialog open={showAliasModal} onOpenChange={setShowAliasModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingAlias ? 'Edit Alias' : 'Add Alias'}</DialogTitle>
            <DialogDescription>
              Map a raw Shopify size to a validated size for sorting.
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
                  <SelectValue placeholder="Select raw size..." />
                </SelectTrigger>
                <SelectContent>
                  {distinctSizes.map(d => (
                    <SelectItem key={d.size} value={d.size}>
                      {d.size} ({d.count} SKUs)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Canonical Size</label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={useCustomCanonical}
                    onChange={(e) => setUseCustomCanonical(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  Custom
                </label>
              </div>
              {useCustomCanonical ? (
                <Input
                  placeholder="Enter custom canonical size..."
                  value={customCanonicalInput}
                  onChange={(e) => setCustomCanonicalInput(e.target.value)}
                />
              ) : (
                <Select value={newAliasCanonical} onValueChange={setNewAliasCanonical}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select validated size..." />
                  </SelectTrigger>
                  <SelectContent>
                    {validatedSizesArray.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAliasModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveAlias}
              disabled={
                !newAliasRaw ||
                (useCustomCanonical ? !customCanonicalInput.trim() : !newAliasCanonical) ||
                isPending
              }
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
