'use client'

import { useState, useEffect, useTransition } from 'react'
import Image from 'next/image'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Button,
  Input,
} from '@/components/ui'
import { Upload, Eye, EyeOff, Tag, Trash2 } from 'lucide-react'
import type { CollectionWithCount, CollectionType } from '@/lib/types/collection'

interface CollectionModalProps {
  open: boolean
  onClose: () => void
  onSave: () => void
  type: CollectionType
  collection: CollectionWithCount | null
}

export function CollectionModal({
  open,
  onClose,
  onSave,
  type,
  collection,
}: CollectionModalProps) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [name, setName] = useState('')
  const [collectionType, setCollectionType] = useState<CollectionType>(type)
  const [shipStart, setShipStart] = useState('')
  const [shipEnd, setShipEnd] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [mappedValues, setMappedValues] = useState<string[]>([])

  const isEditing = collection !== null

  // Reset form when modal opens/closes or collection changes
  useEffect(() => {
    if (open) {
      if (collection) {
        setName(collection.name)
        setCollectionType(collection.type)
        setShipStart(collection.shipWindowStart?.split('T')[0] || '')
        setShipEnd(collection.shipWindowEnd?.split('T')[0] || '')
        setIsActive(collection.isActive !== false)
        setImageUrl(collection.imageUrl)
        setImagePreview(collection.imageUrl)
        // Fetch mapped Shopify values for this collection
        fetch(`/api/collections/${collection.id}/mappings`)
          .then(res => res.json())
          .then(data => setMappedValues(data.mappings || []))
          .catch(() => setMappedValues([]))
      } else {
        setName('')
        setCollectionType(type)
        setShipStart('')
        setShipEnd('')
        setIsActive(true)
        setImageUrl(null)
        setImagePreview(null)
        setMappedValues([])
      }
      setImageFile(null)
      setError(null)
    }
  }, [open, collection, type])

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) {
      setImageFile(file)
      setImagePreview(URL.createObjectURL(file))
    }
  }

  async function handleSave() {
    if (!name.trim()) {
      setError('Name is required')
      return
    }

    setError(null)

    startTransition(async () => {
      try {
        // Create or update collection
        const url = isEditing
          ? `/api/collections/${collection.id}`
          : '/api/collections'
        const method = isEditing ? 'PATCH' : 'POST'

        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(),
            type: collectionType,
            shipWindowStart: shipStart || null,
            shipWindowEnd: shipEnd || null,
            isActive,
          }),
        })

        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Failed to save collection')
        }

        const data = await res.json()
        const collectionId = isEditing ? collection.id : data.collection.id

        // Upload image if changed
        if (imageFile) {
          const formData = new FormData()
          formData.append('file', imageFile)

          const imgRes = await fetch(`/api/collections/${collectionId}/image`, {
            method: 'POST',
            body: formData,
          })

          if (!imgRes.ok) {
            if (imgRes.status === 413) {
              throw new Error('Image is too large. Please use an image under 5MB.')
            }
            const imgData = await imgRes.json().catch(() => ({}))
            throw new Error(imgData.error || 'Failed to upload image')
          }
        }

        onSave()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save collection')
      }
    })
  }

  async function handleRemoveImage() {
    if (!collection) return

    startTransition(async () => {
      try {
        const res = await fetch(`/api/collections/${collection.id}/image`, {
          method: 'DELETE',
        })

        if (res.ok) {
          setImageUrl(null)
          setImagePreview(null)
          setImageFile(null)
        }
      } catch {
        console.error('Failed to remove image')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-background sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Edit Collection' : 'Create New Collection'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 pt-4">
          {/* Name */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Collection Name</label>
            <Input
              value={name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
              placeholder="e.g., FW26 Preppy Goose"
            />
          </div>

          {/* Type */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Type</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="type"
                  checked={collectionType === 'ATS'}
                  onChange={() => setCollectionType('ATS')}
                  className="w-4 h-4"
                />
                <span className="text-sm">ATS (Available to Ship)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="type"
                  checked={collectionType === 'PreOrder'}
                  onChange={() => setCollectionType('PreOrder')}
                  className="w-4 h-4"
                />
                <span className="text-sm">PreOrder</span>
              </label>
            </div>
          </div>

          {/* Visibility Toggle */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Visibility</label>
            <button
              type="button"
              onClick={() => setIsActive(!isActive)}
              className={`flex items-center gap-3 w-full px-4 py-3 rounded-lg border transition-colors ${
                isActive
                  ? 'border-green-500/50 bg-green-500/10 text-green-600'
                  : 'border-orange-500/50 bg-orange-500/10 text-orange-600'
              }`}
            >
              {isActive ? (
                <>
                  <Eye className="h-5 w-5" />
                  <div className="text-left">
                    <div className="font-medium">Visible to buyers</div>
                    <div className="text-xs opacity-75">This collection appears in the buyer portal</div>
                  </div>
                </>
              ) : (
                <>
                  <EyeOff className="h-5 w-5" />
                  <div className="text-left">
                    <div className="font-medium">Hidden from buyers</div>
                    <div className="text-xs opacity-75">This collection is hidden but data is preserved</div>
                  </div>
                </>
              )}
            </button>
          </div>

          {/* Ship Window (PreOrder only) */}
          {collectionType === 'PreOrder' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Ship Window Start</label>
                <Input
                  type="date"
                  value={shipStart}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setShipStart(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Ship Window End</label>
                <Input
                  type="date"
                  value={shipEnd}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setShipEnd(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Image Upload */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Cover Image</label>
            <div className="border border-border rounded-lg overflow-hidden">
              {imagePreview ? (
                <div className="relative">
                  <div className="relative aspect-[16/9] bg-muted">
                    <Image
                      src={imagePreview}
                      alt="Preview"
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                  <div className="flex gap-2 p-3 bg-muted/30">
                    <label className="flex-1">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                      <Button variant="outline" size="sm" className="w-full" asChild>
                        <span>
                          <Upload className="h-4 w-4 mr-1" />
                          Replace
                        </span>
                      </Button>
                    </label>
                    {isEditing && imageUrl && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRemoveImage}
                        disabled={isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <label className="block cursor-pointer">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <div className="aspect-[16/9] flex flex-col items-center justify-center text-muted-foreground hover:bg-muted/50 transition-colors">
                    <Upload className="h-8 w-8 mb-2" />
                    <span className="text-sm">Click to upload image</span>
                    <span className="text-xs">Recommended: 800 x 450px</span>
                  </div>
                </label>
              )}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="text-sm text-destructive">{error}</div>
          )}

          {/* Mapped Shopify Values (only when editing) */}
          {isEditing && (
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Tag className="h-4 w-4" />
                Mapped Shopify Values
              </label>
              {mappedValues.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {mappedValues.map((value, i) => (
                    <code
                      key={i}
                      className="px-2 py-1 bg-muted rounded text-xs font-mono"
                    >
                      {value}
                    </code>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No Shopify values mapped to this collection yet.{' '}
                  <a href="/admin/collections/mapping" className="underline">
                    Go to Mapping
                  </a>
                </p>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4 border-t border-border">
            <Button variant="outline" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isPending}>
              {isPending ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Collection'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
