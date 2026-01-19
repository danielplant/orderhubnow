'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Mail, Plus, X } from 'lucide-react'
import type { EmailRecipientInfo } from '@/lib/types/email'

interface EmailConfirmationModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  orderId: string
  orderNumber: string
  onConfirm: () => void
  onSkip: () => void
}

export function EmailConfirmationModal({
  open,
  onOpenChange,
  orderId,
  orderNumber,
  onConfirm,
  onSkip,
}: EmailConfirmationModalProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [recipients, setRecipients] = useState<EmailRecipientInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Toggle states
  const [sendCustomer, setSendCustomer] = useState(false) // Default OFF
  const [sendRep, setSendRep] = useState(true) // Default ON
  const [sendAdmin, setSendAdmin] = useState(true) // Default ON
  const [saveAsRepDefault, setSaveAsRepDefault] = useState(false)

  // Additional recipients
  const [additionalCustomerRecipients, setAdditionalCustomerRecipients] = useState<string[]>([])
  const [additionalSalesRecipients, setAdditionalSalesRecipients] = useState<string[]>([])
  const [newCustomerRecipient, setNewCustomerRecipient] = useState('')
  const [newSalesRecipient, setNewSalesRecipient] = useState('')

  // Fetch recipient info when modal opens
  useEffect(() => {
    if (open && orderId) {
      setIsLoading(true)
      setError(null)

      fetch(`/api/orders/${orderId}/email-recipients`)
        .then(res => res.json())
        .then((data: EmailRecipientInfo) => {
          setRecipients(data)
          // Set rep toggle based on rep's default preference
          setSendRep(data.repDefaultSendEmail)
          setIsLoading(false)
        })
        .catch(err => {
          console.error('Failed to fetch recipients:', err)
          setError('Failed to load email recipients')
          setIsLoading(false)
        })
    }
  }, [open, orderId])

  const addCustomerRecipient = () => {
    if (newCustomerRecipient && newCustomerRecipient.includes('@')) {
      setAdditionalCustomerRecipients([...additionalCustomerRecipients, newCustomerRecipient])
      setNewCustomerRecipient('')
    }
  }

  const addSalesRecipient = () => {
    if (newSalesRecipient && newSalesRecipient.includes('@')) {
      setAdditionalSalesRecipients([...additionalSalesRecipients, newSalesRecipient])
      setNewSalesRecipient('')
    }
  }

  const removeCustomerRecipient = (index: number) => {
    setAdditionalCustomerRecipients(additionalCustomerRecipients.filter((_, i) => i !== index))
  }

  const removeSalesRecipient = (index: number) => {
    setAdditionalSalesRecipients(additionalSalesRecipients.filter((_, i) => i !== index))
  }

  const handleConfirm = async () => {
    setIsSending(true)
    setError(null)

    try {
      const res = await fetch(`/api/orders/${orderId}/send-emails`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sendCustomer,
          sendRep,
          sendAdmin,
          additionalCustomerRecipients,
          additionalSalesRecipients,
          saveAsRepDefault,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to send emails')
      }

      onConfirm()
    } catch (err) {
      console.error('Failed to send emails:', err)
      setError(err instanceof Error ? err.message : 'Failed to send emails')
      setIsSending(false)
    }
  }

  const handleSkip = () => {
    onSkip()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Order {orderNumber} Submitted
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="ml-2">Loading email settings...</span>
          </div>
        ) : error && !recipients ? (
          <div className="text-center py-8 text-destructive">
            {error}
          </div>
        ) : recipients && (
          <div className="space-y-6">
            {/* Customer Confirmation Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Customer Confirmation</Label>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="sendCustomer"
                    checked={sendCustomer}
                    onCheckedChange={(checked: boolean | 'indeterminate') => setSendCustomer(checked === true)}
                  />
                  <Label htmlFor="sendCustomer" className="text-sm font-normal">
                    {sendCustomer ? 'ON' : 'OFF'}
                  </Label>
                </div>
              </div>

              <div className="pl-4 text-sm text-muted-foreground space-y-1">
                <p>To: {recipients.customerEmail || 'No customer email'}</p>
                {recipients.ccEmails.length > 0 && (
                  <p>CC: {recipients.ccEmails.join(', ')}</p>
                )}
              </div>

              {/* Additional customer recipients */}
              <div className="pl-4 space-y-2">
                {additionalCustomerRecipients.map((email, index) => (
                  <div key={index} className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">+ {email}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0"
                      onClick={() => removeCustomerRecipient(index)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <Input
                    type="email"
                    placeholder="Add recipient..."
                    value={newCustomerRecipient}
                    onChange={(e) => setNewCustomerRecipient(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomerRecipient())}
                    className="h-8 text-sm"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addCustomerRecipient}
                    className="h-8"
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Sales / Rep Notification Section */}
            <div className="space-y-3">
              <Label className="text-base font-semibold">Sales / Rep Notification</Label>

              {/* Admin toggle */}
              <div className="flex items-center justify-between pl-4">
                <span className="text-sm">
                  Admin: {recipients.adminEmails.join(', ') || 'No admin emails configured'}
                </span>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="sendAdmin"
                    checked={sendAdmin}
                    onCheckedChange={(checked: boolean | 'indeterminate') => setSendAdmin(checked === true)}
                  />
                  <Label htmlFor="sendAdmin" className="text-sm font-normal">
                    {sendAdmin ? 'ON' : 'OFF'}
                  </Label>
                </div>
              </div>

              {/* Rep toggle */}
              <div className="flex items-center justify-between pl-4">
                <span className="text-sm">
                  Rep: {recipients.repEmail ? `${recipients.repName} (${recipients.repEmail})` : 'No rep email'}
                </span>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="sendRep"
                    checked={sendRep}
                    onCheckedChange={(checked: boolean | 'indeterminate') => setSendRep(checked === true)}
                    disabled={!recipients.repEmail}
                  />
                  <Label htmlFor="sendRep" className="text-sm font-normal">
                    {sendRep ? 'ON' : 'OFF'}
                  </Label>
                </div>
              </div>

              {/* Save as default */}
              {recipients.repEmail && (
                <div className="flex items-center gap-2 pl-4">
                  <Checkbox
                    id="saveAsRepDefault"
                    checked={saveAsRepDefault}
                    onCheckedChange={(checked: boolean | 'indeterminate') => setSaveAsRepDefault(checked === true)}
                  />
                  <Label htmlFor="saveAsRepDefault" className="text-sm font-normal text-muted-foreground">
                    Save as default for this rep
                  </Label>
                </div>
              )}

              {/* Additional sales recipients */}
              <div className="pl-4 space-y-2">
                {additionalSalesRecipients.map((email, index) => (
                  <div key={index} className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">+ {email}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0"
                      onClick={() => removeSalesRecipient(index)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <Input
                    type="email"
                    placeholder="Add recipient..."
                    value={newSalesRecipient}
                    onChange={(e) => setNewSalesRecipient(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSalesRecipient())}
                    className="h-8 text-sm"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addSalesRecipient}
                    className="h-8"
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={handleSkip}
            disabled={isSending}
          >
            Skip Emails
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={isLoading || isSending}
          >
            {isSending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              'Confirm and Send'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
