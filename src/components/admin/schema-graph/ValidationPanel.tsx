'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { CheckCircle, XCircle, Loader2, ChevronDown, ChevronUp } from 'lucide-react'

interface ValidationResult {
  match: boolean
  differences: string[]
  hardcoded: string
  generated: string
}

interface ValidationPanelProps {
  serviceName: string | null
}

export function ValidationPanel({ serviceName }: ValidationPanelProps) {
  const [result, setResult] = useState<ValidationResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showHardcoded, setShowHardcoded] = useState(false)
  const [showGenerated, setShowGenerated] = useState(false)

  async function handleValidate() {
    if (!serviceName) return

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch('/api/admin/shopify/schema/validate-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceName }),
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error?.message || 'Validation failed')
      }

      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  if (!serviceName) {
    return (
      <div className="p-4 bg-muted rounded-lg text-muted-foreground text-sm">
        Select a service to validate query generation
      </div>
    )
  }

  return (
    <div className="border rounded-lg p-4 space-y-4 bg-white">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Query Validation</h3>
        <Button onClick={handleValidate} disabled={loading} size="sm">
          {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Validate Query
        </Button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-red-800 text-sm">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-3">
          {/* Match status */}
          <div
            className={`flex items-center gap-2 p-3 rounded ${
              result.match
                ? 'bg-green-50 border border-green-200 text-green-800'
                : 'bg-red-50 border border-red-200 text-red-800'
            }`}
          >
            {result.match ? <CheckCircle className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
            <span className="font-medium">
              {result.match ? 'Queries match!' : 'Queries do not match'}
            </span>
          </div>

          {/* Differences */}
          {!result.match && result.differences.length > 0 && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded">
              <h4 className="font-medium text-yellow-800 mb-2">Differences:</h4>
              <pre className="text-xs text-yellow-900 overflow-x-auto max-h-48">
                {result.differences.join('\n')}
              </pre>
            </div>
          )}

          {/* Collapsible query previews */}
          <div>
            <button
              onClick={() => setShowHardcoded(!showHardcoded)}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              {showHardcoded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
              Hardcoded Query
            </button>
            {showHardcoded && (
              <pre className="mt-2 p-3 bg-muted rounded text-xs overflow-x-auto max-h-64">
                {result.hardcoded}
              </pre>
            )}
          </div>

          <div>
            <button
              onClick={() => setShowGenerated(!showGenerated)}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              {showGenerated ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
              Generated Query
            </button>
            {showGenerated && (
              <pre className="mt-2 p-3 bg-muted rounded text-xs overflow-x-auto max-h-64">
                {result.generated}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
