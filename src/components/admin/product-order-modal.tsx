'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Button,
} from '@/components/ui'
import type { CategoryWithProducts, CategoryProduct } from '@/lib/types'
import { reorderProductsInCategory } from '@/lib/data/actions/categories'
import { GripVertical } from 'lucide-react'

export interface ProductOrderModalProps {
  category: CategoryWithProducts
  open: boolean
  onClose: () => void
  onSave: () => void
}

export function ProductOrderModal({
  category,
  open,
  onClose,
  onSave,
}: ProductOrderModalProps) {
  const [items, setItems] = useState<CategoryProduct[]>(category.products)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draggedId, setDraggedId] = useState<string | null>(null)

  useEffect(() => setItems(category.products), [category.products])

  const orderedIds = useMemo(() => items.map((p) => p.id), [items])

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await reorderProductsInCategory(String(category.id), orderedIds)
      if (!res.success) throw new Error(res.error ?? 'failed')
      onSave()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  function handleDragStart(id: string) {
    setDraggedId(id)
  }

  function handleDrop(targetId: string) {
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null)
      return
    }

    const next = items.filter((x) => x.id !== draggedId)
    const targetIdx = next.findIndex((x) => x.id === targetId)
    const dragged = items.find((x) => x.id === draggedId)
    if (!dragged) {
      setDraggedId(null)
      return
    }

    next.splice(targetIdx, 0, dragged)
    setItems(next)
    setDraggedId(null)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : null)}>
      <DialogContent className="bg-background sm:max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Reorder Products — {category.name}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-2">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No products in this category.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {items.map((p) => (
                <li
                  key={p.id}
                  className="rounded-md border border-border bg-card px-3 py-2 cursor-grab active:cursor-grabbing"
                  draggable
                  onDragStart={() => handleDragStart(p.id)}
                  onDragOver={(e) => {
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    handleDrop(p.id)
                  }}
                >
                  <div className="flex items-center gap-3">
                    <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div className="flex flex-col flex-1 min-w-0">
                      <span className="text-sm text-foreground truncate">{p.description}</span>
                      <span className="text-xs text-muted-foreground">{p.skuId}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="flex gap-2 pt-4 border-t border-border">
          <Button onClick={() => void save()} disabled={saving || items.length === 0}>
            {saving ? 'Saving...' : 'Save order'}
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
