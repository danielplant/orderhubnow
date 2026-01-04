'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Button,
} from '@/components/ui'
import { addOrderComment } from '@/lib/data/actions/orders'
import { getOrderComments } from '@/lib/data/queries/orders'

interface OrderCommentsModalProps {
  orderId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface Comment {
  id: string
  text: string
  createdAt: string
  createdBy: string
}

export function OrderCommentsModal({ orderId, open, onOpenChange }: OrderCommentsModalProps) {
  const router = useRouter()
  const [text, setText] = React.useState('')
  const [isSaving, setIsSaving] = React.useState(false)
  const [isLoading, setIsLoading] = React.useState(false)
  const [comments, setComments] = React.useState<Comment[]>([])

  // Load comments when modal opens
  React.useEffect(() => {
    if (open && orderId) {
      setIsLoading(true)
      getOrderComments(orderId)
        .then(setComments)
        .finally(() => setIsLoading(false))
    } else {
      setComments([])
    }
  }, [open, orderId])

  const handleAddComment = async () => {
    if (!orderId || !text.trim()) return
    
    setIsSaving(true)
    try {
      const result = await addOrderComment({ orderId, text: text.trim() })
      if (result.success) {
        setText('')
        // Refresh comments list
        const updated = await getOrderComments(orderId)
        setComments(updated)
        router.refresh()
      }
    } finally {
      setIsSaving(false)
    }
  }

  if (!orderId) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Order Comments</DialogTitle>
        </DialogHeader>

        {/* Comments List */}
        <div className="max-h-64 overflow-y-auto space-y-3 mb-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading comments...</p>
          ) : comments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No comments yet.</p>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="rounded-md border border-border p-3">
                <p className="text-sm">{c.text}</p>
                <p className="text-xs text-muted-foreground mt-2">
                  {c.createdBy} • {new Date(c.createdAt).toLocaleString()}
                </p>
              </div>
            ))
          )}
        </div>

        {/* Add Comment */}
        <div className="space-y-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="min-h-20 w-full rounded-md border border-input bg-background p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="Add a comment…"
          />

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button
              disabled={!text.trim() || isSaving}
              onClick={handleAddComment}
            >
              {isSaving ? 'Adding...' : 'Add Comment'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
