'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Save, Check, Copy, AlertCircle } from 'lucide-react'
import { RepPill } from './rep-pill'
import type { DraftFormData } from '@/lib/contexts/order-context'

/**
 * Customer info for draft attribution
 */
export interface DraftCustomerInfo {
  storeName: string
  buyerName: string
  customerEmail: string
}

interface SaveDraftModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  repId: string | null
  repName: string | null
  formData: DraftFormData
  totalItems: number
  onSave: (repId: string | null, customerInfo: DraftCustomerInfo) => Promise<string>
}

type ModalState = 'form' | 'saving' | 'success' | 'error'

/**
 * SaveDraftModal - confirms rep and customer before saving draft to server
 * 
 * Shows a locked rep pill (if rep context exists) and editable customer fields.
 * On success, displays the draft ID and a shareable link.
 */
export function SaveDraftModal({
  open,
  onOpenChange,
  repId,
  repName,
  formData,
  totalItems,
  onSave,
}: SaveDraftModalProps) {
  const [state, setState] = useState<ModalState>('form')
  const [error, setError] = useState<string | null>(null)
  const [savedDraftId, setSavedDraftId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Customer info fields (pre-populated from formData)
  const [storeName, setStoreName] = useState(formData.storeName || '')
  const [buyerName, setBuyerName] = useState(formData.buyerName || '')
  const [customerEmail, setCustomerEmail] = useState(formData.customerEmail || '')

  const getDraftUrl = (draftId: string) => {
    if (typeof window === 'undefined') return ''
    return `${window.location.origin}/draft/${draftId}`
  }

  const handleCopyLink = async () => {
    if (!savedDraftId) return
    
    try {
      await navigator.clipboard.writeText(getDraftUrl(savedDraftId))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const handleSave = async () => {
    // Validate: at least store name should be filled
    if (!storeName.trim()) {
      setError('Store name is required to save draft')
      return
    }

    setState('saving')
    setError(null)

    try {
      // Use repId prop if available, otherwise fall back to formData.salesRepId
      const effectiveRepId = repId || formData.salesRepId || null

      const draftId = await onSave(effectiveRepId, {
        storeName: storeName.trim(),
        buyerName: buyerName.trim(),
        customerEmail: customerEmail.trim(),
      })
      setSavedDraftId(draftId)
      setState('success')
    } catch (err) {
      console.error('Failed to save draft:', err)
      setError(err instanceof Error ? err.message : 'Failed to save draft')
      setState('error')
    }
  }

  const handleClose = () => {
    onOpenChange(false)
  }

  const canSave = storeName.trim().length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        {/* Form State */}
        {(state === 'form' || state === 'error') && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Save className="h-5 w-5" />
                Save Draft
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-5 py-2">
              {/* Cart summary */}
              <div className="text-sm text-muted-foreground">
                Saving {totalItems} item{totalItems !== 1 ? 's' : ''} as a draft
              </div>

              {/* Rep Section */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Sales Rep</Label>
                {repId && repName ? (
                  <RepPill repId={repId} repName={repName} locked />
                ) : formData.salesRepId ? (
                  <div className="flex items-center gap-2">
                    <RepPill
                      repId={formData.salesRepId}
                      repName={formData.salesRepName || 'Rep'}
                      locked
                    />
                    <span className="text-xs text-muted-foreground">(from saved draft)</span>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground italic">
                    No sales rep assigned
                  </div>
                )}
              </div>

              {/* Customer Section */}
              <div className="space-y-4">
                <Label className="text-sm font-medium">Customer</Label>
                
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="storeName" className="text-xs text-muted-foreground">
                      Store Name *
                    </Label>
                    <Input
                      id="storeName"
                      value={storeName}
                      onChange={(e) => setStoreName(e.target.value)}
                      placeholder="Enter store name"
                      className="mt-1"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="buyerName" className="text-xs text-muted-foreground">
                      Buyer Name
                    </Label>
                    <Input
                      id="buyerName"
                      value={buyerName}
                      onChange={(e) => setBuyerName(e.target.value)}
                      placeholder="Enter buyer name"
                      className="mt-1"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="customerEmail" className="text-xs text-muted-foreground">
                      Email
                    </Label>
                    <Input
                      id="customerEmail"
                      type="email"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      placeholder="Enter email"
                      className="mt-1"
                    />
                  </div>
                </div>
              </div>

              {/* Error message */}
              {error && (
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  {error}
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSave}
                disabled={!canSave}
              >
                Save Draft
              </Button>
            </DialogFooter>
          </>
        )}

        {/* Saving State */}
        {state === 'saving' && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Saving draft...</p>
          </div>
        )}

        {/* Success State */}
        {state === 'success' && savedDraftId && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-green-600">
                <Check className="h-5 w-5" />
                Draft Saved
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <p className="text-sm text-muted-foreground">
                Your draft has been saved successfully.
              </p>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Draft ID</Label>
                <div className="font-mono text-lg font-semibold">{savedDraftId}</div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Shareable Link</Label>
                <div className="flex items-center gap-2">
                  <Input
                    value={getDraftUrl(savedDraftId)}
                    readOnly
                    className="font-mono text-xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleCopyLink}
                    className="shrink-0"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                {copied && (
                  <p className="text-xs text-green-600">Copied to clipboard!</p>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button type="button" onClick={handleClose}>
                Done
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
