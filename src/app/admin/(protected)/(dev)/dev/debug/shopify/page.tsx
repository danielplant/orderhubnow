'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { useState, useEffect, useCallback } from 'react'

export default function ShopifyDebugPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const skuParam = searchParams.get('sku') || ''

  const [sku, setSku] = useState(skuParam)
  const [data, setData] = useState<unknown>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async (skuToFetch: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/diagnostics/shopify?sku=${encodeURIComponent(skuToFetch)}`)
      const json = await res.json()
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch when SKU param changes
  useEffect(() => {
    if (!skuParam) return
    fetchData(skuParam)
  }, [skuParam, fetchData])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (sku.trim()) {
      router.push(`/admin/dev/debug/shopify?sku=${encodeURIComponent(sku.trim())}`)
    }
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Shopify Inventory Debug</h1>

      <form onSubmit={handleSubmit} className="mb-8 flex gap-2">
        <input
          type="text"
          value={sku}
          onChange={(e) => setSku(e.target.value)}
          placeholder="Enter SKU..."
          className="flex-1 px-4 py-2 border rounded bg-background"
        />
        <button
          type="submit"
          className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90"
        >
          Lookup
        </button>
      </form>

      {loading && <p className="text-muted-foreground">Loading...</p>}
      {error && <p className="text-destructive">{error}</p>}
      {data !== null && (
        <div>
          <h2 className="text-lg font-semibold mb-2">Raw Shopify API Response:</h2>
          <pre className="bg-muted p-4 rounded overflow-auto text-sm max-h-[600px]">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}
