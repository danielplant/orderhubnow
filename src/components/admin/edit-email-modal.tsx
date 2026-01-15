'use client'

import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Button,
  Input,
} from '@/components/ui'
import { isValidEmail } from '@/lib/utils/email'
import { Mail, AlertCircle } from 'lucide-react'

interface EditEmailModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentEmail: string
  onSave: (email: string, updateOrder: boolean) => void
}

export function EditEmailModal({
  open,
  onOpenChange,
  currentEmail,
  onSave,
}: EditEmailModalProps) {
  const [email, setEmail] = React.useState('')
  const [updateOrder, setUpdateOrder] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  // Reset state when modal opens
  React.useEffect(() => {
    if (open) {
      setEmail(currentEmail || '')
      setUpdateOrder(true)
      setError(null)
    }
  }, [open, currentEmail])

  const handleSave = () => {
    const trimmedEmail = email.trim()
    
    if (!trimmedEmail) {
      setError('Please enter an email address')
      return
    }
    
    if (!isValidEmail(trimmedEmail)) {
      setError('Please enter a valid email address')
      return
    }
    
    onSave(trimmedEmail, updateOrder)
    onOpenChange(false)
  }

  const handleClose = () => {
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            Edit Customer Email
          </DialogTitle>
          <DialogDescription>
            Update the email address for shipment notifications
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {currentEmail && (
            <div className="text-sm">
              <span className="text-muted-foreground">Current email on order:</span>
              <p className="font-medium mt-1">{currentEmail}</p>
            </div>
          )}

          <div>
            <label htmlFor="new-email" className="text-sm font-medium">
              {currentEmail ? 'New email address' : 'Email address'}
            </label>
            <Input
              id="new-email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setError(null)
              }}
              placeholder="customer@example.com"
              className="mt-1.5"
            />
            {error && (
              <p className="text-sm text-red-600 mt-1 flex items-center gap-1">
                <AlertCircle className="h-3.5 w-3.5" />
                {error}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="radio"
                name="update-option"
                checked={updateOrder}
                onChange={() => setUpdateOrder(true)}
                className="mt-0.5 h-4 w-4"
              />
              <div>
                <span className="text-sm font-medium">Update email on order record</span>
                <p className="text-xs text-muted-foreground">
                  This will also update the customer&apos;s email for future orders and communications
                </p>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="radio"
                name="update-option"
                checked={!updateOrder}
                onChange={() => setUpdateOrder(false)}
                className="mt-0.5 h-4 w-4"
              />
              <div>
                <span className="text-sm font-medium">Use for this shipment only</span>
                <p className="text-xs text-muted-foreground">
                  One-time override, the order record will remain unchanged
                </p>
              </div>
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
