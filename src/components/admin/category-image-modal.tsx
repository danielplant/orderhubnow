'use client'

import { useState } from 'react'
import Image from 'next/image'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Button,
} from '@/components/ui'
import type { SubCategory } from '@/lib/types'

export interface CategoryImageModalProps {
  category: SubCategory
  open: boolean
  onClose: () => void
  onImageUploaded: () => void
}

export function CategoryImageModal({
  category,
  open,
  onClose,
  onImageUploaded,
}: CategoryImageModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null
    setFile(selected)
    if (selected) {
      const url = URL.createObjectURL(selected)
      setPreviewUrl(url)
    } else {
      setPreviewUrl(null)
    }
  }

  async function upload() {
    if (!file) return
    setSaving(true)
    setError(null)

    try {
      const form = new FormData()
      form.append('file', file)

      const res = await fetch(`/api/categories/${category.id}/image`, {
        method: 'POST',
        body: form,
      })
      if (!res.ok) throw new Error('upload failed')

      onImageUploaded()
      onClose()
    } catch {
      setError('Upload failed')
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    setSaving(true)
    setError(null)

    try {
      const res = await fetch(`/api/categories/${category.id}/image`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('delete failed')

      onImageUploaded()
      onClose()
    } catch {
      setError('Delete failed')
    } finally {
      setSaving(false)
    }
  }

  function handleClose() {
    setFile(null)
    setPreviewUrl(null)
    setError(null)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? handleClose() : null)}>
      <DialogContent className="bg-background sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Manage Image — {category.name}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="relative h-44 w-full overflow-hidden rounded-md border border-border bg-card">
            <Image
              src={previewUrl ?? category.imageUrl ?? `/SkuImages/${category.id}.jpg`}
              alt={category.name}
              fill
              className="object-contain"
              unoptimized
              onError={(e) => {
                // Fallback for missing images
                e.currentTarget.src = '/placeholder.svg'
              }}
            />
          </div>

          <input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="text-sm text-foreground"
          />

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="flex gap-2">
            <Button onClick={() => void upload()} disabled={!file || saving}>
              {saving ? 'Uploading...' : 'Upload'}
            </Button>
            <Button variant="secondary" onClick={() => void remove()} disabled={saving}>
              Delete
            </Button>
            <Button variant="secondary" onClick={handleClose} disabled={saving}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
