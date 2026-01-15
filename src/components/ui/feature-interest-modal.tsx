'use client'

import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Button,
} from '@/components/ui'
import { logFeatureInterest } from '@/lib/data/actions/feature-interest'
import { Loader2, CheckCircle2, MessageSquarePlus } from 'lucide-react'

export interface FeatureInterestModalProps {
  feature: string
  trigger: React.ReactNode
  question?: string
  options: string[]
  context?: {
    orderId?: string
    orderNumber?: string
  }
}

/**
 * Reusable modal for capturing user interest in upcoming features.
 * Shows a question with checkbox options and optional free text.
 */
export function FeatureInterestModal({
  feature,
  trigger,
  question,
  options,
  context,
}: FeatureInterestModalProps) {
  const [open, setOpen] = React.useState(false)
  const [selectedOptions, setSelectedOptions] = React.useState<Set<string>>(new Set())
  const [freeText, setFreeText] = React.useState('')
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [isSubmitted, setIsSubmitted] = React.useState(false)

  const handleToggleOption = (option: string) => {
    setSelectedOptions((prev) => {
      const next = new Set(prev)
      if (next.has(option)) {
        next.delete(option)
      } else {
        next.add(option)
      }
      return next
    })
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      await logFeatureInterest({
        feature,
        selectedOptions: Array.from(selectedOptions),
        freeText: freeText.trim() || undefined,
        orderId: context?.orderId,
        orderNumber: context?.orderNumber,
      })
      setIsSubmitted(true)
    } catch {
      // Still show success to user - we don't want to block them
      setIsSubmitted(true)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen)
    if (!newOpen) {
      // Reset state when closing
      setTimeout(() => {
        setSelectedOptions(new Set())
        setFreeText('')
        setIsSubmitted(false)
      }, 200)
    }
  }

  const defaultQuestion = `What would you expect from the ${feature} feature?`

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <div onClick={() => setOpen(true)}>{trigger}</div>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquarePlus className="h-5 w-5 text-primary" />
            {feature} - Coming Soon
          </DialogTitle>
          <DialogDescription>
            Help us build this feature by sharing what you&apos;d expect.
          </DialogDescription>
        </DialogHeader>

        {isSubmitted ? (
          <div className="py-8 text-center space-y-4">
            <CheckCircle2 className="h-12 w-12 text-success mx-auto" />
            <div>
              <p className="font-medium text-lg">Thank you!</p>
              <p className="text-sm text-muted-foreground mt-1">
                Your feedback helps us prioritize and build better features.
              </p>
            </div>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
        ) : (
          <div className="space-y-6 py-4">
            <div>
              <p className="text-sm font-medium mb-3">{question || defaultQuestion}</p>
              <div className="space-y-2">
                {options.map((option) => (
                  <label
                    key={option}
                    className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedOptions.has(option)}
                      onChange={() => handleToggleOption(option)}
                      className="h-4 w-4 rounded border-input accent-primary"
                    />
                    <span className="text-sm">{option}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">
                Anything else? <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <textarea
                value={freeText}
                onChange={(e) => setFreeText(e.target.value)}
                placeholder="Tell us more about what you need..."
                rows={3}
                className="mt-2 w-full rounded-md border border-input bg-background p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  'Submit Feedback'
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
