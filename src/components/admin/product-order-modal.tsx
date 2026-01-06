'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Button,
} from '@/components/ui'
import { Input } from '@/components/ui/input'
import type { CategoryWithProducts, CategoryProduct } from '@/lib/types'
import { updateProductPriority } from '@/lib/data/actions/categories'
import { Check, Loader2 } from 'lucide-react'

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
  const [priorities, setPriorities] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Initialize items and priorities when category changes
  useEffect(() => {
    setItems(category.products)
    const initial: Record<string, string> = {}
    for (const p of category.products) {
      // sortOrder comes from DisplayPriority; show empty for 100000 (end of list)
      const val = p.sortOrder === 100000 || p.sortOrder === 0 ? '' : String(p.sortOrder ?? '')
      initial[p.id] = val
    }
    setPriorities(initial)
  }, [category.products])

  // Sort products by current sortOrder (DisplayPriority) ascending
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      const aPri = a.sortOrder ?? 100000
      const bPri = b.sortOrder ?? 100000
      return aPri - bPri || a.skuId.localeCompare(b.skuId)
    })
  }, [items])

  function handlePriorityChange(productId: string, value: string) {
    setPriorities((prev) => ({ ...prev, [productId]: value }))
  }

  async function handleSave(productId: string) {
    const inputValue = priorities[productId]?.trim() ?? ''
    const priority = inputValue === '' ? null : parseInt(inputValue, 10)

    if (inputValue !== '' && (isNaN(priority!) || priority! < 0)) {
      setError('Priority must be a positive number or empty')
      return
    }

    setSaving(productId)
    setError(null)
    setSaved(null)

    try {
      const res = await updateProductPriority(
        String(category.id),
        productId,
        priority
      )
      if (!res.success) {
        throw new Error(res.error ?? 'Failed to update')
      }

      // Update local state to reflect new priority
      const effectivePriority = priority === null || priority <= 0 ? 100000 : priority
      setItems((prev) =>
        prev.map((p) =>
          p.id === productId ? { ...p, sortOrder: effectivePriority } : p
        )
      )

      setSaved(productId)
      setTimeout(() => setSaved(null), 1500)
      onSave()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(null)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent, productId: string) {
    if (e.key === 'Enter') {
      e.preventDefault()
      void handleSave(productId)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : null)}>
      <DialogContent className="bg-background sm:max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Product Order — {category.name}</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground mb-2">
          Enter priority numbers. Lower numbers appear first. Leave empty for end of list.
        </p>

        <div className="flex-1 overflow-y-auto pr-2">
          {sortedItems.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No products in this category.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {sortedItems.map((p) => (
                <li
                  key={p.id}
                  className="rounded-md border border-border bg-card px-3 py-2"
                >
                  <div className="flex items-center gap-3">
                    <Input
                      type="number"
                      min="1"
                      value={priorities[p.id] ?? ''}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handlePriorityChange(p.id, e.target.value)}
                      onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => handleKeyDown(e, p.id)}
                      className="w-20 flex-shrink-0"
                      placeholder="—"
                      disabled={saving === p.id}
                    />
                    <div className="flex flex-col flex-1 min-w-0">
                      <span className="text-sm text-foreground truncate">{p.description}</span>
                      <span className="text-xs text-muted-foreground">{p.skuId}</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void handleSave(p.id)}
                      disabled={saving === p.id}
                      className="flex-shrink-0 w-20"
                    >
                      {saving === p.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : saved === p.id ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : (
                        'Update'
                      )}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error ? <p className="text-sm text-destructive mt-2">{error}</p> : null}

        <div className="flex gap-2 pt-4 border-t border-border">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
