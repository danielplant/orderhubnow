'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Button,
} from '@/components/ui'
import { cn, focusRing } from '@/lib/utils'
import { Upload, FileSpreadsheet, Download, CheckCircle2, XCircle } from 'lucide-react'

// ============================================================================
// Types
// ============================================================================

interface UploadProductsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface UploadResult {
  success: boolean
  created: number
  updated: number
  errors: Array<{ row: number; message: string }>
}

// ============================================================================
// Component
// ============================================================================

export function UploadProductsModal({ open, onOpenChange }: UploadProductsModalProps) {
  const router = useRouter()
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const [mode, setMode] = React.useState<'ats' | 'preorder'>('ats')
  const [file, setFile] = React.useState<File | null>(null)
  const [isUploading, setIsUploading] = React.useState(false)
  const [result, setResult] = React.useState<UploadResult | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  // Reset state when modal closes
  React.useEffect(() => {
    if (!open) {
      setFile(null)
      setResult(null)
      setError(null)
      setIsUploading(false)
    }
  }, [open])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      setError(null)
      setResult(null)
    }
  }

  const handleUpload = async () => {
    if (!file) return

    setIsUploading(true)
    setError(null)
    setResult(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('mode', mode)

      const response = await fetch('/api/products/upload', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Upload failed')
      }

      const data: UploadResult = await response.json()
      setResult(data)

      // Refresh the page data
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setIsUploading(false)
    }
  }

  const handleDownloadTemplate = () => {
    window.location.href = '/api/products/upload'
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Products</DialogTitle>
          <DialogDescription>
            Upload an Excel file (.xlsx) to add or update products in bulk.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Mode Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Import Mode</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode('ats')}
                className={cn(
                  'flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                  focusRing,
                  mode === 'ats'
                    ? 'border-ats bg-ats-bg text-ats-text'
                    : 'border-border bg-background text-muted-foreground hover:bg-muted/50'
                )}
              >
                ATS (Available to Ship)
              </button>
              <button
                type="button"
                onClick={() => setMode('preorder')}
                className={cn(
                  'flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                  focusRing,
                  mode === 'preorder'
                    ? 'border-preorder bg-preorder-bg text-preorder-text'
                    : 'border-border bg-background text-muted-foreground hover:bg-muted/50'
                )}
              >
                Pre-Order
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Products will be imported with the selected inventory status.
            </p>
          </div>

          {/* File Upload */}
          <div className="space-y-2">
            <label className="text-sm font-medium">File</label>
            <div
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed border-border p-6 transition-colors hover:border-primary hover:bg-muted/30',
                file && 'border-success bg-success/5'
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                className="hidden"
              />
              {file ? (
                <>
                  <FileSpreadsheet className="h-8 w-8 text-success" />
                  <span className="mt-2 text-sm font-medium">{file.name}</span>
                  <span className="text-xs text-muted-foreground">
                    Click to select a different file
                  </span>
                </>
              ) : (
                <>
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <span className="mt-2 text-sm font-medium">Click to select file</span>
                  <span className="text-xs text-muted-foreground">
                    Supports .xlsx and .xls files
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Template Download */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadTemplate}
            className="w-full"
          >
            <Download className="h-4 w-4 mr-2" />
            Download Template
          </Button>

          {/* Error Message */}
          {error && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              <XCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Result Summary */}
          {result && (
            <div
              className={cn(
                'rounded-md p-3 text-sm',
                result.success
                  ? 'bg-success/10 text-success'
                  : 'bg-warning/10 text-warning'
              )}
            >
              <div className="flex items-center gap-2 font-medium">
                {result.success ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                <span>
                  Upload {result.success ? 'Complete' : 'Completed with Errors'}
                </span>
              </div>
              <ul className="mt-2 space-y-1 text-xs">
                <li>Created: {result.created}</li>
                <li>Updated: {result.updated}</li>
                {result.errors.length > 0 && (
                  <li className="text-destructive">
                    Errors: {result.errors.length}
                  </li>
                )}
              </ul>
              {result.errors.length > 0 && (
                <div className="mt-2 max-h-24 overflow-y-auto rounded bg-background p-2 text-xs">
                  {result.errors.slice(0, 5).map((err, i) => (
                    <div key={i}>Row {err.row}: {err.message}</div>
                  ))}
                  {result.errors.length > 5 && (
                    <div className="text-muted-foreground">
                      ...and {result.errors.length - 5} more
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {result ? 'Close' : 'Cancel'}
          </Button>
          {!result && (
            <Button
              onClick={handleUpload}
              disabled={!file || isUploading}
            >
              {isUploading ? 'Uploading...' : 'Upload'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
