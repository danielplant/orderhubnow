'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  DataTable,
  type DataTableColumn,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui'
import { InlineEdit } from '@/components/ui/inline-edit'
import type { PPSize } from '@/lib/types/prepack'
import { createPPSize, updatePPSize, deletePPSize } from '@/lib/data/actions/prepacks'
import { MoreHorizontal, Plus, Trash2 } from 'lucide-react'

// ============================================================================
// Types
// ============================================================================

export interface PrepacksTableProps {
  items: PPSize[]
}

// ============================================================================
// Component
// ============================================================================

export function PrepacksTable({ items }: PrepacksTableProps) {
  const router = useRouter()
  const [showAddModal, setShowAddModal] = React.useState(false)
  const [deleteId, setDeleteId] = React.useState<number | null>(null)
  const [isDeleting, setIsDeleting] = React.useState(false)

  // Add form state
  const [newSize, setNewSize] = React.useState('')
  const [newPP, setNewPP] = React.useState('')
  const [isAdding, setIsAdding] = React.useState(false)
  const [addError, setAddError] = React.useState<string | null>(null)

  const handleAdd = async () => {
    setAddError(null)
    const size = parseInt(newSize)
    if (Number.isNaN(size)) {
      setAddError('Size must be a number')
      return
    }
    if (!newPP.trim()) {
      setAddError('Corresponding PP is required')
      return
    }

    setIsAdding(true)
    const result = await createPPSize({ size, correspondingPP: newPP.trim() })
    setIsAdding(false)

    if (result.success) {
      setShowAddModal(false)
      setNewSize('')
      setNewPP('')
      router.refresh()
    } else {
      setAddError(result.error ?? 'Failed to add')
    }
  }

  const handleDelete = async () => {
    if (deleteId === null) return
    setIsDeleting(true)
    await deletePPSize(String(deleteId))
    setIsDeleting(false)
    setDeleteId(null)
    router.refresh()
  }

  const columns = React.useMemo<Array<DataTableColumn<PPSize>>>(
    () => [
      {
        id: 'size',
        header: 'Size',
        cell: (r) => (
          <InlineEdit
            value={r.size}
            type="number"
            onSave={async (v) => {
              const n = Number(v)
              if (!Number.isFinite(n)) throw new Error('Invalid size')
              const result = await updatePPSize(String(r.id), { size: n })
              if (!result.success) throw new Error(result.error)
              router.refresh()
            }}
          />
        ),
      },
      {
        id: 'correspondingPP',
        header: 'Corresponding PP',
        cell: (r) => (
          <InlineEdit
            value={r.correspondingPP}
            type="text"
            onSave={async (v) => {
              if (!v.trim()) throw new Error('PP is required')
              const result = await updatePPSize(String(r.id), { correspondingPP: v.trim() })
              if (!result.success) throw new Error(result.error)
              router.refresh()
            }}
          />
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: (r) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => setDeleteId(r.id)}
                className="text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [router]
  )

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Maps individual sizes to their prepack type (e.g., size 4 → &quot;2pc&quot;).
        </p>
        <Button onClick={() => setShowAddModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Mapping
        </Button>
      </div>

      {/* Table */}
      <DataTable
        data={items}
        columns={columns}
        getRowId={(r) => String(r.id)}
        enableRowSelection={false}
        pageSize={100}
      />

      {/* Add Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="bg-background sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Prepack Size Mapping</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4 mt-4">
            <div>
              <label className="block text-sm font-medium mb-1">Size</label>
              <input
                type="number"
                value={newSize}
                onChange={(e) => setNewSize(e.target.value)}
                placeholder="e.g., 4"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Corresponding PP</label>
              <input
                type="text"
                value={newPP}
                onChange={(e) => setNewPP(e.target.value)}
                placeholder="e.g., 2pc"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            {addError && <p className="text-sm text-destructive">{addError}</p>}

            <div className="flex gap-2 justify-end">
              <Button
                variant="secondary"
                onClick={() => setShowAddModal(false)}
                disabled={isAdding}
              >
                Cancel
              </Button>
              <Button onClick={handleAdd} disabled={isAdding}>
                {isAdding ? 'Adding...' : 'Add'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent className="bg-background sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Prepack Mapping</DialogTitle>
          </DialogHeader>

          <p className="text-muted-foreground mt-2">
            Are you sure you want to delete this size mapping? This action cannot be undone.
          </p>

          <div className="flex gap-2 justify-end mt-4">
            <Button
              variant="secondary"
              onClick={() => setDeleteId(null)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
