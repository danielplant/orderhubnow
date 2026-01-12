'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui'
import { CollectionCard } from './collection-card'
import { CollectionModal } from './collection-modal'
import type { CollectionWithCount, CollectionType } from '@/lib/types/collection'

interface CollectionGridProps {
  atsCollections: CollectionWithCount[]
  preOrderCollections: CollectionWithCount[]
}

export function CollectionGrid({
  atsCollections,
  preOrderCollections,
}: CollectionGridProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [modalOpen, setModalOpen] = useState(false)
  const [modalType, setModalType] = useState<CollectionType>('ATS')
  const [editingCollection, setEditingCollection] = useState<CollectionWithCount | null>(null)

  // Local state for optimistic reordering
  const [atsOrder, setAtsOrder] = useState(atsCollections)
  const [preOrderOrder, setPreOrderOrder] = useState(preOrderCollections)

  // Sync props to local state when they change
  if (atsCollections !== atsOrder && !isPending) {
    setAtsOrder(atsCollections)
  }
  if (preOrderCollections !== preOrderOrder && !isPending) {
    setPreOrderOrder(preOrderCollections)
  }

  function handleAddCollection(type: CollectionType) {
    setModalType(type)
    setEditingCollection(null)
    setModalOpen(true)
  }

  function handleEditCollection(collection: CollectionWithCount) {
    setModalType(collection.type)
    setEditingCollection(collection)
    setModalOpen(true)
  }

  async function handleReorder(type: CollectionType, orderedIds: number[]) {
    // Optimistic update
    if (type === 'ATS') {
      const reordered = orderedIds
        .map((id) => atsOrder.find((c) => c.id === id))
        .filter((c): c is CollectionWithCount => c !== undefined)
      setAtsOrder(reordered)
    } else {
      const reordered = orderedIds
        .map((id) => preOrderOrder.find((c) => c.id === id))
        .filter((c): c is CollectionWithCount => c !== undefined)
      setPreOrderOrder(reordered)
    }

    // Persist to server
    startTransition(async () => {
      try {
        const res = await fetch('/api/collections/reorder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type, orderedIds }),
        })
        if (!res.ok) throw new Error('Failed to reorder')
        router.refresh()
      } catch (error) {
        console.error('Reorder failed:', error)
        // Revert on error
        router.refresh()
      }
    })
  }

  function handleModalClose() {
    setModalOpen(false)
    setEditingCollection(null)
  }

  function handleModalSave() {
    setModalOpen(false)
    setEditingCollection(null)
    router.refresh()
  }

  return (
    <div className="space-y-10">
      {/* ATS Collections Section */}
      <CollectionSection
        title="Available to Ship (ATS)"
        type="ATS"
        collections={atsOrder}
        onAddCollection={() => handleAddCollection('ATS')}
        onEditCollection={handleEditCollection}
        onReorder={(ids) => handleReorder('ATS', ids)}
        isPending={isPending}
      />

      {/* PreOrder Collections Section */}
      <CollectionSection
        title="Pre-Order"
        type="PreOrder"
        collections={preOrderOrder}
        onAddCollection={() => handleAddCollection('PreOrder')}
        onEditCollection={handleEditCollection}
        onReorder={(ids) => handleReorder('PreOrder', ids)}
        isPending={isPending}
      />

      {/* Create/Edit Modal */}
      <CollectionModal
        open={modalOpen}
        onClose={handleModalClose}
        onSave={handleModalSave}
        type={modalType}
        collection={editingCollection}
      />
    </div>
  )
}

interface CollectionSectionProps {
  title: string
  type: CollectionType
  collections: CollectionWithCount[]
  onAddCollection: () => void
  onEditCollection: (collection: CollectionWithCount) => void
  onReorder: (orderedIds: number[]) => void
  isPending: boolean
}

function CollectionSection({
  title,
  type,
  collections,
  onAddCollection,
  onEditCollection,
  onReorder,
  isPending,
}: CollectionSectionProps) {
  const [draggedId, setDraggedId] = useState<number | null>(null)
  // dropPosition: 'before-{id}' or 'after-{id}' to show drop zone between cards
  const [dropPosition, setDropPosition] = useState<string | null>(null)

  function handleDragStart(e: React.DragEvent, id: number) {
    setDraggedId(id)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragEnd() {
    setDraggedId(null)
    setDropPosition(null)
  }

  function handleDragOver(e: React.DragEvent, id: number, side: 'left' | 'right') {
    e.preventDefault()
    if (draggedId === null || draggedId === id) return

    const position = side === 'left' ? `before-${id}` : `after-${id}`
    setDropPosition(position)
  }

  function handleDrop(e: React.DragEvent, targetId: number, side: 'left' | 'right') {
    e.preventDefault()
    if (draggedId === null || draggedId === targetId) return

    const oldIndex = collections.findIndex((c) => c.id === draggedId)
    let newIndex = collections.findIndex((c) => c.id === targetId)

    if (oldIndex === -1 || newIndex === -1) return

    // Adjust index based on drop side
    if (side === 'right') {
      newIndex = newIndex + 1
    }
    // If moving forward, account for removal
    if (oldIndex < newIndex) {
      newIndex = newIndex - 1
    }

    // Reorder
    const newOrder = [...collections]
    const [removed] = newOrder.splice(oldIndex, 1)
    newOrder.splice(newIndex, 0, removed)

    onReorder(newOrder.map((c) => c.id))
    setDraggedId(null)
    setDropPosition(null)
  }

  return (
    <div className="bg-background rounded-lg border border-border overflow-hidden">
      <div className="flex justify-between items-center px-6 py-4 border-b border-border bg-muted/30">
        <h3 className="text-lg font-semibold">{title}</h3>
        <Button size="sm" onClick={onAddCollection}>
          <Plus className="h-4 w-4 mr-1" />
          Add Collection
        </Button>
      </div>

      <div className="p-6">
        {collections.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            No {type === 'ATS' ? 'ATS' : 'Pre-Order'} collections yet.{' '}
            <button
              onClick={onAddCollection}
              className="underline hover:text-foreground"
            >
              Create one
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {collections.map((collection, index) => (
              <div
                key={collection.id}
                className={`relative ${isPending ? 'pointer-events-none' : ''}`}
              >
                {/* Left drop zone indicator */}
                {draggedId !== null && draggedId !== collection.id && (
                  <div
                    className={`absolute -left-2 top-0 bottom-0 w-4 z-20 ${
                      dropPosition === `before-${collection.id}`
                        ? 'bg-primary/20'
                        : ''
                    }`}
                    onDragOver={(e) => handleDragOver(e, collection.id, 'left')}
                    onDrop={(e) => handleDrop(e, collection.id, 'left')}
                  >
                    {dropPosition === `before-${collection.id}` && (
                      <div className="absolute left-1/2 top-0 bottom-0 w-1 bg-primary rounded-full" />
                    )}
                  </div>
                )}

                {/* Card wrapper */}
                <div
                  draggable
                  onDragStart={(e) => handleDragStart(e, collection.id)}
                  onDragEnd={handleDragEnd}
                  className={`
                    transition-all duration-150
                    ${draggedId === collection.id ? 'opacity-50 scale-95' : ''}
                  `}
                >
                  <CollectionCard
                    collection={collection}
                    onClick={() => onEditCollection(collection)}
                  />
                </div>

                {/* Right drop zone indicator (only for last item) */}
                {draggedId !== null && draggedId !== collection.id && index === collections.length - 1 && (
                  <div
                    className={`absolute -right-2 top-0 bottom-0 w-4 z-20 ${
                      dropPosition === `after-${collection.id}`
                        ? 'bg-primary/20'
                        : ''
                    }`}
                    onDragOver={(e) => handleDragOver(e, collection.id, 'right')}
                    onDrop={(e) => handleDrop(e, collection.id, 'right')}
                  >
                    {dropPosition === `after-${collection.id}` && (
                      <div className="absolute left-1/2 top-0 bottom-0 w-1 bg-primary rounded-full" />
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
