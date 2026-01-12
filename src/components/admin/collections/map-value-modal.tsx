'use client'

import { useState, useEffect, useTransition } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Button,
  Input,
} from '@/components/ui'
import type {
  ShopifyValueMappingWithCollection,
  CollectionWithCount,
} from '@/lib/types/collection'

interface MapValueModalProps {
  open: boolean
  onClose: () => void
  onSave: () => void
  mapping: ShopifyValueMappingWithCollection | null
  collections: CollectionWithCount[]
}

export function MapValueModal({
  open,
  onClose,
  onSave,
  mapping,
  collections,
}: MapValueModalProps) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'map' | 'defer'>('map')
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>('')
  const [deferNote, setDeferNote] = useState('')

  // Reset form when modal opens or mapping changes
  useEffect(() => {
    if (open && mapping) {
      setError(null)
      setMode(mapping.status === 'deferred' ? 'defer' : 'map')
      setSelectedCollectionId(mapping.collectionId?.toString() || '')
      setDeferNote(mapping.note || '')
    }
  }, [open, mapping])

  if (!mapping) return null

  // Group collections by type for the dropdown
  const atsCollections = collections.filter((c) => c.type === 'ATS')
  const preOrderCollections = collections.filter((c) => c.type === 'PreOrder')

  async function handleMap() {
    if (!selectedCollectionId || !mapping) {
      setError('Please select a collection')
      return
    }

    setError(null)
    startTransition(async () => {
      try {
        const res = await fetch(`/api/shopify-mappings/${mapping!.id}/map`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ collectionId: parseInt(selectedCollectionId) }),
        })

        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Failed to map value')
        }

        onSave()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to map value')
      }
    })
  }

  async function handleDefer() {
    if (!mapping) return
    setError(null)
    startTransition(async () => {
      try {
        const res = await fetch(`/api/shopify-mappings/${mapping!.id}/defer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ note: deferNote || null }),
        })

        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Failed to defer value')
        }

        onSave()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to defer value')
      }
    })
  }

  async function handleUnmap() {
    if (!mapping) return
    setError(null)
    startTransition(async () => {
      try {
        const res = await fetch(`/api/shopify-mappings/${mapping!.id}/map`, {
          method: 'DELETE',
        })

        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Failed to unmap value')
        }

        onSave()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to unmap value')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-background sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Map Shopify Value</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 pt-4">
          {/* Raw Value Display */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">
              Raw Shopify Value
            </label>
            <div className="p-3 bg-muted rounded-lg">
              <code className="text-sm font-mono break-all">
                {mapping.rawValue}
              </code>
            </div>
            <div className="text-sm text-muted-foreground">
              Affects <strong>{mapping.skuCount}</strong> SKU{mapping.skuCount !== 1 ? 's' : ''}
            </div>
          </div>

          {/* Mode Toggle */}
          <div className="flex gap-2 p-1 bg-muted rounded-lg">
            <button
              onClick={() => setMode('map')}
              className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                mode === 'map'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Map to Collection
            </button>
            <button
              onClick={() => setMode('defer')}
              className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                mode === 'defer'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Defer
            </button>
          </div>

          {/* Map Mode */}
          {mode === 'map' && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Select Collection</label>
              <select
                value={selectedCollectionId}
                onChange={(e) => setSelectedCollectionId(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Choose a collection...</option>
                {atsCollections.length > 0 && (
                  <optgroup label="Available to Ship (ATS)">
                    {atsCollections.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.skuCount} SKUs)
                      </option>
                    ))}
                  </optgroup>
                )}
                {preOrderCollections.length > 0 && (
                  <optgroup label="PreOrder">
                    {preOrderCollections.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.skuCount} SKUs)
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              <p className="text-xs text-muted-foreground">
                SKUs with this Shopify value will appear in the selected collection
              </p>
            </div>
          )}

          {/* Defer Mode */}
          {mode === 'defer' && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Note (optional)</label>
              <Input
                value={deferNote}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDeferNote(e.target.value)}
                placeholder="e.g., Waiting for product launch date"
              />
              <p className="text-xs text-muted-foreground">
                Deferred values won&apos;t show as unmapped warnings. SKUs remain hidden until mapped.
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="text-sm text-destructive">{error}</div>
          )}

          {/* Actions */}
          <div className="flex justify-between pt-4 border-t border-border">
            <div>
              {mapping.status === 'mapped' && (
                <Button
                  variant="outline"
                  onClick={handleUnmap}
                  disabled={isPending}
                  className="text-destructive hover:text-destructive"
                >
                  Remove Mapping
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose} disabled={isPending}>
                Cancel
              </Button>
              <Button
                onClick={mode === 'map' ? handleMap : handleDefer}
                disabled={isPending || (mode === 'map' && !selectedCollectionId)}
              >
                {isPending
                  ? 'Saving...'
                  : mode === 'map'
                    ? 'Map to Collection'
                    : 'Defer'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
