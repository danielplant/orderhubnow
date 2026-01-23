'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Search, User, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface RepPickerItem {
  id: number
  name: string
  code: string
  status: 'active' | 'legacy' | 'disabled' | 'invited'
}

interface RepPickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Dialog for admins to select a rep to view as.
 * Fetches reps via /api/reps/picker with server-side search.
 */
export function RepPickerDialog({ open, onOpenChange }: RepPickerDialogProps) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [reps, setReps] = useState<RepPickerItem[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  // Debounced search
  const fetchReps = useCallback(async (query: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (query) params.set('search', query)
      params.set('limit', '20')

      const res = await fetch(`/api/reps/picker?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setReps(data.reps || [])
      }
    } catch (error) {
      console.error('Failed to fetch reps:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch on open
  useEffect(() => {
    if (open) {
      setSearch('')
      setSelectedId(null)
      fetchReps('')
    }
  }, [open, fetchReps])

  // Debounced search effect
  useEffect(() => {
    const timer = setTimeout(() => {
      if (open) {
        fetchReps(search)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [search, open, fetchReps])

  const handleViewAs = () => {
    const rep = reps.find((r) => r.id === selectedId)
    if (!rep) return

    const params = new URLSearchParams()
    params.set('adminViewAs', String(rep.id))
    params.set('repName', rep.name)

    onOpenChange(false)
    router.push(`/rep?${params.toString()}`)
  }

  const getStatusColor = (status: RepPickerItem['status']) => {
    switch (status) {
      case 'active':
        return 'bg-green-500'
      case 'legacy':
        return 'bg-amber-500'
      case 'disabled':
        return 'bg-red-500'
      case 'invited':
        return 'bg-blue-500'
      default:
        return 'bg-gray-500'
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>View as Sales Rep</DialogTitle>
          <DialogDescription>
            Select a rep to view their portal. You will be in read-only mode.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Results list */}
          <div className="max-h-64 overflow-y-auto border rounded-md">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : reps.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                {search ? 'No reps found' : 'No reps available'}
              </div>
            ) : (
              <div className="divide-y">
                {reps.map((rep) => (
                  <button
                    key={rep.id}
                    type="button"
                    onClick={() => setSelectedId(rep.id)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors',
                      selectedId === rep.id && 'bg-primary/10'
                    )}
                  >
                    <div className="size-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                      <User className="size-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{rep.name}</div>
                      <div className="text-xs text-muted-foreground">
                        Code: {rep.code}
                      </div>
                    </div>
                    <div
                      className={cn('size-2 rounded-full flex-shrink-0', getStatusColor(rep.status))}
                      title={rep.status}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleViewAs} disabled={!selectedId}>
              View as Rep
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
