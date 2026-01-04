'use client'

import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Button,
} from '@/components/ui'
import { cn } from '@/lib/utils'
import {
  Check,
  AlertTriangle,
  X,
  Loader2,
  Download,
  Upload,
  FileSpreadsheet,
} from 'lucide-react'

// ============================================================================
// Types
// ============================================================================

interface PreviewRow {
  StoreName: string
  Email: string
  CustomerName?: string
  Phone?: string
  Rep?: string
  rowNumber: number
  errors?: string[]
}

interface PreviewResult {
  success: boolean
  preview?: PreviewRow[]
  totalRows?: number
  validRows?: number
  invalidRows?: number
  message?: string
}

interface ImportResult {
  success: boolean
  created?: number
  updated?: number
  errors?: number
  errorDetails?: Array<{ row: number; email: string; error: string }>
  message?: string
}

interface CustomerExcelImportModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onComplete?: () => void
}

type ImportState = 'upload' | 'preview' | 'importing' | 'complete' | 'error'

// ============================================================================
// Component
// ============================================================================

export function CustomerExcelImportModal({
  open,
  onOpenChange,
  onComplete,
}: CustomerExcelImportModalProps) {
  const [state, setState] = React.useState<ImportState>('upload')
  const [file, setFile] = React.useState<File | null>(null)
  const [preview, setPreview] = React.useState<PreviewResult | null>(null)
  const [result, setResult] = React.useState<ImportResult | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [showAllErrors, setShowAllErrors] = React.useState(false)
  const [isDragging, setIsDragging] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  // Reset state when modal opens
  React.useEffect(() => {
    if (open) {
      setState('upload')
      setFile(null)
      setPreview(null)
      setResult(null)
      setError(null)
      setShowAllErrors(false)
    }
  }, [open])

  const handleFileSelect = async (selectedFile: File) => {
    setFile(selectedFile)
    setError(null)

    // Send to API for preview
    const formData = new FormData()
    formData.append('file', selectedFile)
    formData.append('mode', 'preview')

    try {
      const response = await fetch('/api/customers/import-excel', {
        method: 'POST',
        body: formData,
      })

      const data: PreviewResult = await response.json()

      if (!data.success) {
        setError(data.message || 'Failed to parse file')
        return
      }

      setPreview(data)
      setState('preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse file')
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile) {
      handleFileSelect(droppedFile)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleBrowse = () => {
    fileInputRef.current?.click()
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      handleFileSelect(selectedFile)
    }
  }

  const handleImport = async () => {
    if (!file) return

    setState('importing')

    const formData = new FormData()
    formData.append('file', file)
    formData.append('mode', 'import')

    try {
      const response = await fetch('/api/customers/import-excel', {
        method: 'POST',
        body: formData,
      })

      const data: ImportResult = await response.json()
      setResult(data)
      setState(data.success ? 'complete' : 'error')

      if (data.success) {
        onComplete?.()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
      setState('error')
    }
  }

  const handleDownloadTemplate = () => {
    // Create a simple template file
    const headers = [
      'StoreName',
      'Email',
      'CustomerName',
      'Phone',
      'Rep',
      'Street1',
      'Street2',
      'City',
      'StateProvince',
      'ZipPostal',
      'Country',
      'Website',
    ]
    const exampleRow = [
      'Example Store',
      'contact@example.com',
      'John Doe',
      '555-1234',
      'Jane Smith',
      '123 Main St',
      'Suite 100',
      'Toronto',
      'ON',
      'M5V 1A1',
      'CA',
      'https://example.com',
    ]

    const csvContent = [headers.join(','), exampleRow.join(',')].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'customers-import-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleDownloadErrors = () => {
    if (!result?.errorDetails) return

    const content = result.errorDetails
      .map((e) => `Row ${e.row}: ${e.email} - ${e.error}`)
      .join('\n')

    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'import-errors.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleClose = () => {
    onOpenChange(false)
  }

  const handleBack = () => {
    setState('upload')
    setFile(null)
    setPreview(null)
    setError(null)
  }

  const displayedErrors = showAllErrors
    ? result?.errorDetails
    : result?.errorDetails?.slice(0, 3)

  return (
    <Dialog open={open} onOpenChange={state === 'importing' ? undefined : onOpenChange}>
      <DialogContent className="bg-background sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {state === 'complete' && (result?.errors ?? 0) === 0 && (
              <Check className="h-5 w-5 text-success" />
            )}
            {state === 'complete' && (result?.errors ?? 0) > 0 && (
              <AlertTriangle className="h-5 w-5 text-warning" />
            )}
            {state === 'error' && <X className="h-5 w-5 text-destructive" />}
            {state === 'importing' && (
              <Loader2 className="h-5 w-5 text-primary animate-spin" />
            )}
            {state === 'upload' && <FileSpreadsheet className="h-5 w-5" />}
            {state === 'preview' && <FileSpreadsheet className="h-5 w-5" />}
            {state === 'upload' && 'Import Customers from Excel'}
            {state === 'preview' && 'Import Preview'}
            {state === 'importing' && 'Importing...'}
            {state === 'complete' && (result?.errors ?? 0) === 0 && 'Import Complete'}
            {state === 'complete' && (result?.errors ?? 0) > 0 && 'Import Completed with Errors'}
            {state === 'error' && 'Import Failed'}
          </DialogTitle>
        </DialogHeader>

        <div className="mt-4">
          {/* Upload State */}
          {state === 'upload' && (
            <div className="space-y-4">
              {/* Drop Zone */}
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={cn(
                  'border-2 border-dashed rounded-lg p-8 text-center transition-colors',
                  isDragging
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-muted-foreground'
                )}
              >
                <FileSpreadsheet className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground mb-2">
                  Drag & drop .xlsx file here
                </p>
                <p className="text-muted-foreground text-sm mb-4">or</p>
                <Button variant="outline" onClick={handleBrowse}>
                  Browse Files
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={handleFileInputChange}
                />
              </div>

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              {/* Column Info */}
              <div className="text-sm text-muted-foreground">
                <p className="mb-1">Expected columns:</p>
                <p>
                  <strong>StoreName*</strong>, <strong>Email*</strong>, CustomerName,
                  Phone, Rep, Street1, City, Country
                </p>
                <p className="text-xs mt-1">(* = required)</p>
              </div>

              <Button variant="ghost" size="sm" onClick={handleDownloadTemplate}>
                <Download className="h-4 w-4 mr-2" />
                Download Template
              </Button>
            </div>
          )}

          {/* Preview State */}
          {state === 'preview' && preview && (
            <div className="space-y-4">
              <div className="flex gap-4 text-sm">
                <span>
                  File: <span className="font-medium">{file?.name}</span>
                </span>
              </div>

              <div className="flex gap-4 text-sm">
                <span>
                  Total rows: <span className="font-semibold">{preview.totalRows}</span>
                </span>
                <span>
                  Valid: <span className="font-semibold text-success">{preview.validRows}</span>
                </span>
                {(preview.invalidRows ?? 0) > 0 && (
                  <span>
                    Invalid: <span className="font-semibold text-destructive">{preview.invalidRows}</span>
                  </span>
                )}
              </div>

              {/* Preview Table */}
              <div className="border border-border rounded-md overflow-hidden">
                <div className="overflow-x-auto max-h-48">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">#</th>
                        <th className="px-3 py-2 text-left font-medium">Store Name</th>
                        <th className="px-3 py-2 text-left font-medium">Email</th>
                        <th className="px-3 py-2 text-left font-medium">Contact</th>
                        <th className="px-3 py-2 text-left font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {preview.preview?.map((row, i) => (
                        <tr key={i} className={row.errors ? 'bg-destructive/5' : ''}>
                          <td className="px-3 py-2 text-muted-foreground">{row.rowNumber}</td>
                          <td className="px-3 py-2">{row.StoreName || '—'}</td>
                          <td className="px-3 py-2">{row.Email || '—'}</td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {row.CustomerName || '—'}
                          </td>
                          <td className="px-3 py-2">
                            {row.errors ? (
                              <span className="text-destructive text-xs">
                                {row.errors.join(', ')}
                              </span>
                            ) : (
                              <Check className="h-4 w-4 text-success" />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {(preview.totalRows ?? 0) > 10 && (
                <p className="text-xs text-muted-foreground text-center">
                  Showing first 10 of {preview.totalRows} rows
                </p>
              )}

              {(preview.invalidRows ?? 0) > 0 && (
                <p className="text-sm text-warning">
                  <AlertTriangle className="h-4 w-4 inline mr-1" />
                  {preview.invalidRows} rows have missing required fields and will be skipped
                </p>
              )}

              <div className="flex gap-2 justify-between">
                <Button variant="ghost" onClick={handleBack}>
                  Back
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={(preview.validRows ?? 0) === 0}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Import {preview.validRows} Customers
                </Button>
              </div>
            </div>
          )}

          {/* Importing State */}
          {state === 'importing' && (
            <div className="text-center py-8">
              <Loader2 className="h-8 w-8 text-primary animate-spin mx-auto mb-4" />
              <p className="text-muted-foreground">Importing customers...</p>
            </div>
          )}

          {/* Complete State - Success */}
          {state === 'complete' && (result?.errors ?? 0) === 0 && (
            <div className="space-y-4">
              <p className="text-muted-foreground">
                Successfully imported customers from Excel.
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-md border border-border p-3 text-center">
                  <div className="text-2xl font-semibold text-success">
                    {result?.created?.toLocaleString() ?? 0}
                  </div>
                  <div className="text-sm text-muted-foreground">New customers created</div>
                </div>
                <div className="rounded-md border border-border p-3 text-center">
                  <div className="text-2xl font-semibold text-info">
                    {result?.updated?.toLocaleString() ?? 0}
                  </div>
                  <div className="text-sm text-muted-foreground">Existing customers updated</div>
                </div>
              </div>

              <div className="flex gap-2 justify-end mt-6">
                <Button onClick={handleClose}>Close</Button>
              </div>
            </div>
          )}

          {/* Complete with Errors State */}
          {state === 'complete' && (result?.errors ?? 0) > 0 && (
            <div className="space-y-4">
              <div className="flex gap-4 text-sm">
                <span>
                  Created:{' '}
                  <span className="font-semibold">{result?.created?.toLocaleString()}</span>
                </span>
                <span>
                  Updated:{' '}
                  <span className="font-semibold">{result?.updated?.toLocaleString()}</span>
                </span>
                <span>
                  Errors:{' '}
                  <span className="font-semibold text-destructive">
                    {result?.errors?.toLocaleString()}
                  </span>
                </span>
              </div>

              <div className="rounded-md border border-border bg-muted/30 p-3 max-h-48 overflow-y-auto">
                <p className="text-sm font-medium mb-2">Failed to import:</p>
                <ul className="text-sm text-muted-foreground space-y-1">
                  {displayedErrors?.map((e, i) => (
                    <li key={i}>
                      Row {e.row}: <span className="text-foreground">{e.email}</span> — {e.error}
                    </li>
                  ))}
                </ul>
                {(result?.errorDetails?.length ?? 0) > 3 && !showAllErrors && (
                  <button
                    onClick={() => setShowAllErrors(true)}
                    className="text-sm text-primary hover:underline mt-2"
                  >
                    Show all {result?.errorDetails?.length} errors
                  </button>
                )}
              </div>

              <div className="flex gap-2 justify-between">
                <Button variant="ghost" size="sm" onClick={handleDownloadErrors}>
                  <Download className="h-4 w-4 mr-2" />
                  Download Error Log
                </Button>
                <Button onClick={handleClose}>Close</Button>
              </div>
            </div>
          )}

          {/* Error State */}
          {state === 'error' && (
            <div className="space-y-4">
              <p className="text-destructive">{error || result?.message || 'Import failed'}</p>

              <div className="flex gap-2 justify-end">
                <Button variant="secondary" onClick={handleClose}>
                  Close
                </Button>
                <Button onClick={handleBack}>Try Again</Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
