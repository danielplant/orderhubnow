'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Image as ImageIcon, RefreshCw, BarChart3, CheckCircle, XCircle, Edit2, Save, ArrowRight, Plug, Plus, Trash2 } from 'lucide-react'

// Locations that have been wired to use ImageConfigProvider context
const WIRED_LOCATIONS = new Set([
  'admin_products_table',
  'admin_product_modal',
  'admin_collection_card',
  'buyer_product_thumbnail',
  'buyer_product_lightbox',
  'buyer_collection_card',
])

interface SkuImageConfig {
  id: string
  description: string
  pixelSize: number | null
  useSrcSet: boolean
  primary: string
  fallback: string | null
  enabled: boolean
  sortOrder: number
}

interface ThumbnailSize {
  pixelSize: number
  quality: number
  fit: string
  background: string
  enabled: boolean
  sortOrder: number
}

interface ThumbnailSizeStats {
  pixelSize: number
  cached: number
  needed: number
  total: number
}

interface ThumbnailAnalysis {
  byPixelSize: Record<number, { cached: number; needed: number }>
  totalSkusWithImages: number
  needsGenerationCount: number
  estimatedTimeMinutes: number
}

interface GenerationStatus {
  inProgress: boolean
  lastRun: {
    status: string
    progressPercent: number
    processedCount: number
    totalImages: number
    currentStepDetail: string
    errorMessage?: string
  } | null
}

// Helper to format source name
function formatSource(source: string | null): string {
  if (!source) return '—'
  switch (source) {
    case 's3_thumbnail': return 'S3 Thumbnail'
    case 'shopify_cdn': return 'Shopify CDN'
    case 'static_file': return 'Static File'
    default: return source
  }
}

// Helper to get source badge style
function getSourceBadge(source: string | null): string {
  if (!source) return 'bg-muted text-muted-foreground'
  switch (source) {
    case 's3_thumbnail': return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
    case 'shopify_cdn': return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
    case 'static_file': return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
    default: return 'bg-muted text-foreground'
  }
}

// Extract area from config id
function getArea(id: string): 'buyer' | 'admin' | 'export' {
  if (id.startsWith('buyer_')) return 'buyer'
  if (id.includes('export')) return 'export'
  return 'admin'
}

function getAreaLabel(area: 'buyer' | 'admin' | 'export'): string {
  switch (area) {
    case 'buyer': return 'Buyer UI'
    case 'admin': return 'Admin UI'
    case 'export': return 'Exports'
  }
}

function getAreaColor(area: 'buyer' | 'admin' | 'export'): string {
  switch (area) {
    case 'buyer': return 'border-l-emerald-500'
    case 'admin': return 'border-l-blue-500'
    case 'export': return 'border-l-purple-500'
  }
}

export default function ImagesPage() {
  // Display locations state
  const [displayConfigs, setDisplayConfigs] = useState<SkuImageConfig[]>([])
  const [editingConfig, setEditingConfig] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<SkuImageConfig>>({})

  // Thumbnail sizes state
  const [thumbnailSizes, setThumbnailSizes] = useState<ThumbnailSize[]>([])
  const [editingSize, setEditingSize] = useState<number | null>(null)
  const [sizeEditForm, setSizeEditForm] = useState<Partial<ThumbnailSize>>({})
  const [showAddSize, setShowAddSize] = useState(false)
  const [newSizeForm, setNewSizeForm] = useState({ pixelSize: '', quality: 80, fit: 'contain', background: '#FFFFFF' })

  // Thumbnail analysis state
  const [sizeStats, setSizeStats] = useState<ThumbnailSizeStats[]>([])
  const [selectedSizes, setSelectedSizes] = useState<Set<number>>(new Set())
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus | null>(null)

  // Export Policy state
  const [exportPolicy, setExportPolicy] = useState<{
    thumbnailSize: number
    excelDisplayPx: number
    pdfDisplayPx: number
    requireS3: boolean
    allowShopifyFallback: boolean
    imageConcurrency: number
  } | null>(null)
  const [editingExportPolicy, setEditingExportPolicy] = useState(false)
  const [exportPolicyForm, setExportPolicyForm] = useState<{
    thumbnailSize: string
    excelDisplayPx: string
    pdfDisplayPx: string
    requireS3: boolean
    allowShopifyFallback: boolean
    imageConcurrency: string
  }>({
    thumbnailSize: '120',
    excelDisplayPx: '96',
    pdfDisplayPx: '60',
    requireS3: true,
    allowShopifyFallback: true,
    imageConcurrency: '10',
  })
  const [savingExportPolicy, setSavingExportPolicy] = useState(false)

  // General UI state
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Fetch all data on mount, including coverage analysis
  useEffect(() => {
    Promise.all([
      fetchDisplayConfigs(),
      fetchThumbnailSizes(),
      fetchThumbnailStatus(),
      fetchExportPolicy(),
    ]).then(() => {
      // Auto-analyze coverage after loading configs
      analyzeThumbnails()
    }).finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function fetchExportPolicy() {
    try {
      const res = await fetch('/api/admin/shopify/settings/export-policy')
      if (!res.ok) throw new Error('Failed to fetch export policy')
      const data = await res.json()
      if (data.policy) {
        setExportPolicy(data.policy)
        setExportPolicyForm({
          thumbnailSize: String(data.policy.thumbnailSize),
          excelDisplayPx: String(data.policy.excelDisplayPx),
          pdfDisplayPx: String(data.policy.pdfDisplayPx),
          requireS3: data.policy.requireS3,
          allowShopifyFallback: data.policy.allowShopifyFallback,
          imageConcurrency: String(data.policy.imageConcurrency),
        })
      }
    } catch (err) {
      console.error('Failed to fetch export policy:', err)
    }
  }

  async function saveExportPolicy() {
    setSavingExportPolicy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/shopify/settings/export-policy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thumbnailSize: parseInt(exportPolicyForm.thumbnailSize, 10),
          excelDisplayPx: parseInt(exportPolicyForm.excelDisplayPx, 10),
          pdfDisplayPx: parseInt(exportPolicyForm.pdfDisplayPx, 10),
          requireS3: exportPolicyForm.requireS3,
          allowShopifyFallback: exportPolicyForm.allowShopifyFallback,
          imageConcurrency: parseInt(exportPolicyForm.imageConcurrency, 10),
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save export policy')
      }
      const data = await res.json()
      setExportPolicy(data.policy)
      setEditingExportPolicy(false)
      setSuccess('Export policy saved successfully')
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save export policy')
    } finally {
      setSavingExportPolicy(false)
    }
  }

  // Poll for generation status when generating
  useEffect(() => {
    if (!isGenerating && !generationStatus?.inProgress) return
    const interval = setInterval(fetchThumbnailStatus, 3000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGenerating, generationStatus?.inProgress])

  async function fetchThumbnailSizes() {
    try {
      const res = await fetch('/api/admin/shopify/images/sizes')
      if (!res.ok) throw new Error('Failed to fetch thumbnail sizes')
      const data = await res.json()
      setThumbnailSizes(data.sizes || [])
    } catch (err) {
      console.error('Failed to fetch thumbnail sizes:', err)
    }
  }

  async function fetchDisplayConfigs() {
    try {
      const res = await fetch('/api/admin/shopify/images/configs')
      if (!res.ok) throw new Error('Failed to fetch display configurations')
      const data = await res.json()
      setDisplayConfigs(data.configs || [])

      // Initialize selected sizes based on unique pixel sizes from configs
      const pixelSizes = new Set(
        (data.configs || [])
          .filter((c: SkuImageConfig) => c.enabled && c.pixelSize)
          .map((c: SkuImageConfig) => c.pixelSize)
      )
      setSelectedSizes(pixelSizes as Set<number>)
    } catch (err) {
      console.error('Failed to fetch display configs:', err)
    }
  }

  async function fetchThumbnailStatus() {
    try {
      const res = await fetch('/api/admin/shopify/thumbnails/status')
      if (!res.ok) return
      const data = await res.json()
      setGenerationStatus(data)

      // If generation just completed, refresh analysis
      if (data.lastRun?.status === 'completed' && isGenerating) {
        setIsGenerating(false)
        analyzeThumbnails()
      }
    } catch (err) {
      console.error('Failed to fetch thumbnail status:', err)
    }
  }

  const analyzeThumbnails = useCallback(async () => {
    setIsAnalyzing(true)
    setError(null)

    try {
      const res = await fetch('/api/admin/shopify/images/analyze')
      if (!res.ok) throw new Error('Failed to analyze thumbnails')
      const data: ThumbnailAnalysis = await res.json()

      // Convert analysis to size stats array
      const stats: ThumbnailSizeStats[] = Object.entries(data.byPixelSize)
        .map(([size, counts]) => ({
          pixelSize: parseInt(size),
          cached: counts.cached,
          needed: counts.needed,
          total: counts.cached + counts.needed,
        }))
        .sort((a, b) => a.pixelSize - b.pixelSize)

      setSizeStats(stats)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze thumbnails')
    } finally {
      setIsAnalyzing(false)
    }
  }, [])

  async function generateThumbnails() {
    if (selectedSizes.size === 0) {
      setError('Please select at least one size to generate')
      return
    }

    setIsGenerating(true)
    setError(null)

    try {
      const res = await fetch('/api/admin/shopify/images/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pixelSizes: Array.from(selectedSizes) }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to start thumbnail generation')
      }
      // Generation started, polling will track progress
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate thumbnails')
      setIsGenerating(false)
    }
  }

  async function saveDisplayConfig(configId: string) {
    try {
      const res = await fetch(`/api/admin/shopify/images/configs/${configId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      })
      if (!res.ok) throw new Error('Failed to save configuration')

      setSuccess('Configuration saved')
      setEditingConfig(null)
      fetchDisplayConfigs()
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save configuration')
    }
  }

  function toggleSize(size: number) {
    setSelectedSizes(prev => {
      const next = new Set(prev)
      if (next.has(size)) {
        next.delete(size)
      } else {
        next.add(size)
      }
      return next
    })
  }

  function startEditing(config: SkuImageConfig) {
    setEditingConfig(config.id)
    setEditForm({
      pixelSize: config.pixelSize,
      primary: config.primary,
      fallback: config.fallback,
      enabled: config.enabled,
    })
  }

  // Thumbnail size CRUD
  function startEditingSize(size: ThumbnailSize) {
    setEditingSize(size.pixelSize)
    setSizeEditForm({
      quality: size.quality,
      fit: size.fit,
      background: size.background,
      enabled: size.enabled,
    })
  }

  async function saveThumbnailSize(pixelSize: number) {
    try {
      const res = await fetch(`/api/admin/shopify/images/sizes/${pixelSize}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sizeEditForm),
      })
      if (!res.ok) throw new Error('Failed to save size')

      setSuccess('Size saved')
      setEditingSize(null)
      fetchThumbnailSizes()
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save size')
    }
  }

  async function addThumbnailSize() {
    const pixelSize = parseInt(newSizeForm.pixelSize, 10)
    if (isNaN(pixelSize) || pixelSize < 16 || pixelSize > 2048) {
      setError('Pixel size must be between 16 and 2048')
      return
    }

    try {
      const res = await fetch('/api/admin/shopify/images/sizes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newSizeForm, pixelSize }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to add size')
      }

      setSuccess(`Added ${pixelSize}px`)
      setShowAddSize(false)
      setNewSizeForm({ pixelSize: '', quality: 80, fit: 'contain', background: '#FFFFFF' })
      fetchThumbnailSizes()
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add size')
    }
  }

  async function deleteThumbnailSize(pixelSize: number) {
    if (!confirm(`Delete ${pixelSize}px thumbnail size?`)) return

    try {
      const res = await fetch(`/api/admin/shopify/images/sizes/${pixelSize}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to delete size')
      }

      setSuccess(`Deleted ${pixelSize}px`)
      fetchThumbnailSizes()
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete size')
    }
  }

  if (loading) {
    return (
      <main className="p-6">
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          Loading...
        </div>
      </main>
    )
  }

  // Group configs by area
  const configsByArea = displayConfigs.reduce((acc, config) => {
    const area = getArea(config.id)
    if (!acc[area]) acc[area] = []
    acc[area].push(config)
    return acc
  }, {} as Record<'buyer' | 'admin' | 'export', SkuImageConfig[]>)

  // Get unique pixel sizes needed by enabled display locations
  const requiredPixelSizes = [...new Set(
    displayConfigs
      .filter(c => c.enabled && c.pixelSize)
      .map(c => c.pixelSize!)
  )].sort((a, b) => a - b)

  const inProgress = generationStatus?.inProgress || isGenerating

  // Calculate overall coverage summary for required sizes
  const requiredStats = sizeStats.filter(s => requiredPixelSizes.includes(s.pixelSize))
  const totalRequired = requiredStats.reduce((sum, s) => sum + s.total, 0)
  const totalCached = requiredStats.reduce((sum, s) => sum + s.cached, 0)
  const totalMissing = requiredStats.reduce((sum, s) => sum + s.needed, 0)
  const overallCoveragePercent = totalRequired > 0 ? Math.round((totalCached / totalRequired) * 100) : 0
  const isFullCoverage = totalMissing === 0 && totalRequired > 0

  // Calculate export-specific coverage (based on export policy thumbnail size)
  const exportSize = exportPolicy?.thumbnailSize ?? 120
  const exportSizeStats = sizeStats.find(s => s.pixelSize === exportSize)
  const exportCached = exportSizeStats?.cached ?? 0
  const exportMissing = exportSizeStats?.needed ?? 0
  const exportTotal = exportSizeStats?.total ?? 0
  const exportCoveragePercent = exportTotal > 0 ? Math.round((exportCached / exportTotal) * 100) : 100
  const isExportReady = exportMissing === 0 || !exportPolicy?.requireS3

  return (
    <main className="p-6 max-w-7xl">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <ImageIcon className="h-6 w-6" />
          <h1 className="text-2xl font-bold">SKU Image Display Matrix</h1>
        </div>
        <p className="text-muted-foreground">
          Configure image sources and fallback chains for each display location
        </p>
      </div>

      {/* Export Coverage Summary Banner */}
      {sizeStats.length > 0 && !isAnalyzing && (
        <div className={`mb-6 p-4 rounded-lg border ${
          isExportReady
            ? 'border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-800'
            : 'border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isExportReady ? (
                <CheckCircle className="h-6 w-6 text-emerald-500" />
              ) : (
                <BarChart3 className="h-6 w-6 text-amber-500" />
              )}
              <div>
                <h3 className={`font-semibold ${isExportReady ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}`}>
                  {isExportReady ? 'Exports Ready' : 'Exports Blocked'}
                </h3>
                <p className={`text-sm ${isExportReady ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                  {isExportReady
                    ? `All ${exportCached.toLocaleString()} thumbnails at ${exportSize}px are cached — XLSX/PDF exports will proceed`
                    : `${exportMissing.toLocaleString()} thumbnails missing at ${exportSize}px — exports will be blocked until generated`
                  }
                </p>
                {exportPolicy?.requireS3 && !isExportReady && (
                  <p className="text-xs text-amber-500 mt-1">
                    Coverage gate is active: exports require 100% S3 coverage
                  </p>
                )}
                {!exportPolicy?.requireS3 && exportMissing > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Coverage gate is disabled: exports will fallback to Shopify CDN for missing images
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className={`text-2xl font-bold ${isExportReady ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {exportCoveragePercent}%
                </div>
                <div className="text-xs text-muted-foreground">{exportSize}px Coverage</div>
              </div>
              {!isExportReady && (
                <button
                  onClick={() => {
                    // Select export size and scroll to generation section
                    setSelectedSizes(new Set([exportSize]))
                    document.getElementById('thumbnail-generation')?.scrollIntoView({ behavior: 'smooth' })
                  }}
                  className="px-3 py-1.5 text-sm font-medium rounded-lg bg-amber-600 text-white hover:bg-amber-700"
                >
                  Generate Missing
                </button>
              )}
            </div>
          </div>
          {/* Overall coverage info (secondary) */}
          {!isFullCoverage && exportMissing === 0 && (
            <div className="mt-3 pt-3 border-t border-amber-200 dark:border-amber-700 text-sm text-muted-foreground">
              Note: {totalMissing.toLocaleString()} thumbnails missing for other sizes ({overallCoveragePercent}% overall coverage)
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 rounded-lg border border-red-200 bg-red-50 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-6 p-4 rounded-lg border border-green-200 bg-green-50 text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300">
          {success}
        </div>
      )}

      {/* Export Policy Section */}
      <div className="rounded-lg border border-border bg-card mb-6">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Export Policy</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Configure how XLSX and PDF exports fetch and display product images
            </p>
          </div>
          {!editingExportPolicy && (
            <button
              onClick={() => setEditingExportPolicy(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-border hover:bg-muted"
            >
              <Edit2 className="h-3.5 w-3.5" />
              Edit
            </button>
          )}
        </div>
        <div className="p-4">
          {exportPolicy ? (
            editingExportPolicy ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Thumbnail Size (px)</label>
                  <select
                    value={exportPolicyForm.thumbnailSize}
                    onChange={(e) => setExportPolicyForm(f => ({ ...f, thumbnailSize: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
                  >
                    {thumbnailSizes.filter(s => s.enabled).map(size => (
                      <option key={size.pixelSize} value={size.pixelSize}>{size.pixelSize}px</option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground mt-1">S3 thumbnail size for exports</p>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Excel Display (px)</label>
                  <input
                    type="number"
                    min="32"
                    max="256"
                    value={exportPolicyForm.excelDisplayPx}
                    onChange={(e) => setExportPolicyForm(f => ({ ...f, excelDisplayPx: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Image width in XLSX</p>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">PDF Display (px)</label>
                  <input
                    type="number"
                    min="32"
                    max="256"
                    value={exportPolicyForm.pdfDisplayPx}
                    onChange={(e) => setExportPolicyForm(f => ({ ...f, pdfDisplayPx: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Image width in PDF</p>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Concurrency</label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={exportPolicyForm.imageConcurrency}
                    onChange={(e) => setExportPolicyForm(f => ({ ...f, imageConcurrency: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Max parallel fetches</p>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={exportPolicyForm.requireS3}
                      onChange={(e) => setExportPolicyForm(f => ({ ...f, requireS3: e.target.checked }))}
                      className="rounded"
                    />
                    <span className="text-sm">Require S3 Cache</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={exportPolicyForm.allowShopifyFallback}
                      onChange={(e) => setExportPolicyForm(f => ({ ...f, allowShopifyFallback: e.target.checked }))}
                      className="rounded"
                    />
                    <span className="text-sm">Allow Shopify Fallback</span>
                  </label>
                </div>
                <div className="flex items-end gap-2">
                  <button
                    onClick={saveExportPolicy}
                    disabled={savingExportPolicy}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    <Save className="h-3.5 w-3.5" />
                    {savingExportPolicy ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={() => {
                      setEditingExportPolicy(false)
                      if (exportPolicy) {
                        setExportPolicyForm({
                          thumbnailSize: String(exportPolicy.thumbnailSize),
                          excelDisplayPx: String(exportPolicy.excelDisplayPx),
                          pdfDisplayPx: String(exportPolicy.pdfDisplayPx),
                          requireS3: exportPolicy.requireS3,
                          allowShopifyFallback: exportPolicy.allowShopifyFallback,
                          imageConcurrency: String(exportPolicy.imageConcurrency),
                        })
                      }
                    }}
                    className="px-3 py-2 text-sm font-medium rounded-lg border border-border hover:bg-muted"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div>
                  <div className="text-2xl font-bold">{exportPolicy.thumbnailSize}px</div>
                  <div className="text-sm text-muted-foreground">S3 Thumbnail Size</div>
                </div>
                <div>
                  <div className="text-2xl font-bold">{exportPolicy.excelDisplayPx}px</div>
                  <div className="text-sm text-muted-foreground">Excel Display</div>
                </div>
                <div>
                  <div className="text-2xl font-bold">{exportPolicy.pdfDisplayPx}px</div>
                  <div className="text-sm text-muted-foreground">PDF Display</div>
                </div>
                <div>
                  <div className="text-2xl font-bold">{exportPolicy.imageConcurrency}</div>
                  <div className="text-sm text-muted-foreground">Concurrency</div>
                </div>
                <div className="col-span-2 md:col-span-4 flex gap-4 pt-2 border-t border-border">
                  <div className="flex items-center gap-2">
                    {exportPolicy.requireS3 ? (
                      <CheckCircle className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="text-sm">Require S3 Cache</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {exportPolicy.allowShopifyFallback ? (
                      <CheckCircle className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="text-sm">Allow Shopify Fallback</span>
                  </div>
                </div>
              </div>
            )
          ) : (
            <div className="text-sm text-muted-foreground">Loading export policy...</div>
          )}
        </div>
      </div>

      {/* Section 1: Display Locations Matrix */}
      <div className="rounded-lg border border-border bg-card mb-6">
        <div className="p-4 border-b border-border">
          <h2 className="font-semibold">Display Locations</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Image source configuration for each display location in the application
          </p>
        </div>

        {/* Matrix Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left py-3 px-4 font-medium w-56">Location</th>
                <th className="text-center py-3 px-4 font-medium w-20">
                  <span className="flex items-center justify-center gap-1" title="Component uses ImageConfigProvider">
                    <Plug className="h-3 w-3" />
                    Wired
                  </span>
                </th>
                <th className="text-center py-3 px-4 font-medium w-24">S3 Size</th>
                <th className="text-center py-3 px-4 font-medium">
                  <span className="flex items-center justify-center gap-1">
                    1st
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  </span>
                </th>
                <th className="text-center py-3 px-4 font-medium">
                  <span className="flex items-center justify-center gap-1">
                    2nd
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  </span>
                </th>
                <th className="text-center py-3 px-4 font-medium">3rd</th>
                <th className="text-center py-3 px-4 font-medium w-20">Status</th>
                <th className="text-center py-3 px-4 font-medium w-16">Edit</th>
              </tr>
            </thead>
            <tbody>
              {(['buyer', 'admin', 'export'] as const).map(area => (
                configsByArea[area]?.length > 0 && (
                  <React.Fragment key={area}>
                    {/* Area header */}
                    <tr className="bg-muted/30">
                      <td colSpan={8} className="py-2 px-4">
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {getAreaLabel(area)}
                        </span>
                      </td>
                    </tr>
                    {/* Area configs */}
                    {configsByArea[area].map(config => (
                      <tr
                        key={config.id}
                        className={`border-b border-border/50 hover:bg-muted/20 border-l-4 ${getAreaColor(area)}`}
                      >
                        <td className="py-3 px-4">
                          <div className="font-medium text-foreground">
                            {config.id.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()).replace(/^(Buyer |Admin )/, '')}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5 max-w-xs truncate" title={config.description}>
                            {config.description.split('.')[0]}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          {WIRED_LOCATIONS.has(config.id) ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300" title="Component reads config from context">
                              <CheckCircle className="h-3 w-3" />
                              Yes
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title="Component uses hardcoded values">
                              <XCircle className="h-3 w-3" />
                              No
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {editingConfig === config.id ? (
                            <select
                              value={editForm.pixelSize ?? ''}
                              onChange={e => setEditForm({ ...editForm, pixelSize: e.target.value ? parseInt(e.target.value) : null })}
                              className="px-2 py-1 rounded border border-border bg-background text-xs"
                            >
                              <option value="">— (srcSet/direct)</option>
                              {thumbnailSizes.filter(s => s.enabled).map(size => (
                                <option key={size.pixelSize} value={size.pixelSize}>{size.pixelSize}px</option>
                              ))}
                            </select>
                          ) : config.useSrcSet ? (
                            <span className="text-xs font-medium px-2 py-1 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                              srcSet
                            </span>
                          ) : config.pixelSize ? (
                            <span className="font-mono text-xs">{config.pixelSize}px</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {editingConfig === config.id ? (
                            <select
                              value={editForm.primary ?? 's3_thumbnail'}
                              onChange={e => setEditForm({ ...editForm, primary: e.target.value })}
                              className="px-2 py-1 rounded border border-border bg-background text-xs"
                            >
                              <option value="s3_thumbnail">S3 Thumbnail</option>
                              <option value="shopify_cdn">Shopify CDN</option>
                              <option value="static_file">Static File</option>
                            </select>
                          ) : (
                            <span className={`text-xs font-medium px-2 py-1 rounded ${getSourceBadge(config.primary)}`}>
                              {formatSource(config.primary)}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {editingConfig === config.id ? (
                            <select
                              value={editForm.fallback ?? ''}
                              onChange={e => setEditForm({ ...editForm, fallback: e.target.value || null })}
                              className="px-2 py-1 rounded border border-border bg-background text-xs"
                            >
                              <option value="">None</option>
                              <option value="s3_thumbnail">S3 Thumbnail</option>
                              <option value="shopify_cdn">Shopify CDN</option>
                              <option value="static_file">Static File</option>
                            </select>
                          ) : config.fallback ? (
                            <span className={`text-xs font-medium px-2 py-1 rounded ${getSourceBadge(config.fallback)}`}>
                              {formatSource(config.fallback)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="text-xs text-muted-foreground px-2 py-1 rounded bg-muted">
                            Placeholder
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          {editingConfig === config.id ? (
                            <input
                              type="checkbox"
                              checked={editForm.enabled ?? true}
                              onChange={e => setEditForm({ ...editForm, enabled: e.target.checked })}
                              className="rounded border-border"
                            />
                          ) : config.enabled ? (
                            <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />
                          ) : (
                            <XCircle className="h-4 w-4 text-muted-foreground mx-auto" />
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {editingConfig === config.id ? (
                            <button
                              onClick={() => saveDisplayConfig(config.id)}
                              className="p-1.5 rounded hover:bg-accent text-primary"
                              title="Save"
                            >
                              <Save className="h-4 w-4" />
                            </button>
                          ) : (
                            <button
                              onClick={() => startEditing(config)}
                              className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                              title="Edit"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                )
              ))}
            </tbody>
          </table>
        </div>

        <div className="p-4 border-t border-border bg-muted/30">
          <div className="flex flex-wrap gap-4 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-medium text-muted-foreground">Legend:</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`px-2 py-0.5 rounded ${getSourceBadge('s3_thumbnail')}`}>S3 Thumbnail</span>
              <span className="text-muted-foreground">Optimized thumbnails from S3</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`px-2 py-0.5 rounded ${getSourceBadge('shopify_cdn')}`}>Shopify CDN</span>
              <span className="text-muted-foreground">Original images from Shopify</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`px-2 py-0.5 rounded ${getSourceBadge('static_file')}`}>Static File</span>
              <span className="text-muted-foreground">Local static assets</span>
            </div>
          </div>
        </div>
      </div>

      {/* Section 2: Thumbnail Sizes */}
      <div className="rounded-lg border border-border bg-card mb-6">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Thumbnail Sizes</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Define available S3 thumbnail sizes and their generation settings
            </p>
          </div>
          <button
            onClick={() => setShowAddSize(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Add Size
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left py-3 px-4 font-medium">Size</th>
                <th className="text-center py-3 px-4 font-medium">Quality</th>
                <th className="text-center py-3 px-4 font-medium">Fit</th>
                <th className="text-center py-3 px-4 font-medium">Background</th>
                <th className="text-center py-3 px-4 font-medium">Enabled</th>
                <th className="text-center py-3 px-4 font-medium w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {/* Add new size row */}
              {showAddSize && (
                <tr className="border-b border-border bg-emerald-50/50 dark:bg-emerald-900/10">
                  <td className="py-3 px-4">
                    <input
                      type="number"
                      placeholder="e.g., 800"
                      value={newSizeForm.pixelSize}
                      onChange={e => setNewSizeForm({ ...newSizeForm, pixelSize: e.target.value })}
                      className="w-20 px-2 py-1 rounded border border-border bg-background text-sm"
                    />
                    <span className="ml-1 text-muted-foreground">px</span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={newSizeForm.quality}
                      onChange={e => setNewSizeForm({ ...newSizeForm, quality: parseInt(e.target.value) || 80 })}
                      className="w-16 px-2 py-1 rounded border border-border bg-background text-sm text-center"
                    />
                  </td>
                  <td className="py-3 px-4 text-center">
                    <select
                      value={newSizeForm.fit}
                      onChange={e => setNewSizeForm({ ...newSizeForm, fit: e.target.value })}
                      className="px-2 py-1 rounded border border-border bg-background text-xs"
                    >
                      <option value="contain">contain</option>
                      <option value="cover">cover</option>
                      <option value="fill">fill</option>
                    </select>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <input
                      type="text"
                      value={newSizeForm.background}
                      onChange={e => setNewSizeForm({ ...newSizeForm, background: e.target.value })}
                      className="w-20 px-2 py-1 rounded border border-border bg-background text-sm text-center font-mono"
                    />
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className="text-muted-foreground text-xs">Yes</span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={addThumbnailSize}
                        className="p-1.5 rounded hover:bg-accent text-primary"
                        title="Save"
                      >
                        <Save className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setShowAddSize(false)}
                        className="p-1.5 rounded hover:bg-accent text-muted-foreground"
                        title="Cancel"
                      >
                        <XCircle className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              )}
              {thumbnailSizes.map(size => (
                <tr key={size.pixelSize} className="border-b border-border/50 hover:bg-muted/20">
                  <td className="py-3 px-4">
                    <span className="font-mono font-medium">{size.pixelSize}px</span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    {editingSize === size.pixelSize ? (
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={sizeEditForm.quality ?? size.quality}
                        onChange={e => setSizeEditForm({ ...sizeEditForm, quality: parseInt(e.target.value) || 80 })}
                        className="w-16 px-2 py-1 rounded border border-border bg-background text-sm text-center"
                      />
                    ) : (
                      <span className="text-muted-foreground">{size.quality}</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-center">
                    {editingSize === size.pixelSize ? (
                      <select
                        value={sizeEditForm.fit ?? size.fit}
                        onChange={e => setSizeEditForm({ ...sizeEditForm, fit: e.target.value })}
                        className="px-2 py-1 rounded border border-border bg-background text-xs"
                      >
                        <option value="contain">contain</option>
                        <option value="cover">cover</option>
                        <option value="fill">fill</option>
                      </select>
                    ) : (
                      <span className="text-xs font-mono">{size.fit}</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-center">
                    {editingSize === size.pixelSize ? (
                      <input
                        type="text"
                        value={sizeEditForm.background ?? size.background}
                        onChange={e => setSizeEditForm({ ...sizeEditForm, background: e.target.value })}
                        className="w-20 px-2 py-1 rounded border border-border bg-background text-sm text-center font-mono"
                      />
                    ) : (
                      <span className="font-mono text-xs">{size.background}</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-center">
                    {editingSize === size.pixelSize ? (
                      <input
                        type="checkbox"
                        checked={sizeEditForm.enabled ?? size.enabled}
                        onChange={e => setSizeEditForm({ ...sizeEditForm, enabled: e.target.checked })}
                        className="rounded border-border"
                      />
                    ) : size.enabled ? (
                      <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />
                    ) : (
                      <XCircle className="h-4 w-4 text-muted-foreground mx-auto" />
                    )}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {editingSize === size.pixelSize ? (
                        <>
                          <button
                            onClick={() => saveThumbnailSize(size.pixelSize)}
                            className="p-1.5 rounded hover:bg-accent text-primary"
                            title="Save"
                          >
                            <Save className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setEditingSize(null)}
                            className="p-1.5 rounded hover:bg-accent text-muted-foreground"
                            title="Cancel"
                          >
                            <XCircle className="h-4 w-4" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => startEditingSize(size)}
                            className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                            title="Edit"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => deleteThumbnailSize(size.pixelSize)}
                            className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-red-500"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 3: Thumbnail Generation */}
      <div id="thumbnail-generation" className="rounded-lg border border-border bg-card p-6 mb-6">
        <h2 className="font-semibold mb-4">S3 Thumbnail Cache Status</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Pre-generate optimized thumbnails for faster loading. Required sizes based on enabled display locations: <strong>{requiredPixelSizes.join('px, ')}px</strong>
        </p>

        {/* Progress when generating */}
        {inProgress && generationStatus?.lastRun && (
          <div className="mb-4 p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-amber-700 dark:text-amber-300">
                {generationStatus.lastRun.currentStepDetail || 'Starting...'}
              </span>
              <span className="text-sm font-bold text-amber-700 dark:text-amber-300">
                {generationStatus.lastRun.progressPercent ?? 0}%
              </span>
            </div>
            <div className="w-full h-2 bg-amber-200 dark:bg-amber-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-500 transition-all duration-300"
                style={{ width: `${generationStatus.lastRun.progressPercent ?? 0}%` }}
              />
            </div>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
              {generationStatus.lastRun.processedCount?.toLocaleString() ?? 0} of{' '}
              {generationStatus.lastRun.totalImages?.toLocaleString() ?? 0} images
            </p>
          </div>
        )}

        {/* Last run result */}
        {generationStatus?.lastRun && !inProgress && (
          <div className={`mb-4 p-4 rounded-lg ${generationStatus.lastRun.status === 'completed' ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
            <div className="flex items-center gap-2">
              {generationStatus.lastRun.status === 'completed' ? (
                <CheckCircle className="h-5 w-5 text-emerald-500" />
              ) : (
                <XCircle className="h-5 w-5 text-red-500" />
              )}
              <span className={`text-sm font-medium ${generationStatus.lastRun.status === 'completed' ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}>
                {generationStatus.lastRun.status === 'completed'
                  ? `Generated ${generationStatus.lastRun.processedCount?.toLocaleString() ?? 0} thumbnails`
                  : `Failed: ${generationStatus.lastRun.errorMessage}`}
              </span>
            </div>
          </div>
        )}

        {/* Size selection table */}
        {sizeStats.length > 0 && !inProgress && (
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-center py-2 px-3 font-medium w-20">Generate</th>
                  <th className="text-left py-2 px-3 font-medium">Size</th>
                  <th className="text-right py-2 px-3 font-medium">Cached</th>
                  <th className="text-right py-2 px-3 font-medium">Needed</th>
                  <th className="text-left py-2 px-3 font-medium w-48">Coverage</th>
                </tr>
              </thead>
              <tbody>
                {sizeStats.map(stat => {
                  const percent = stat.total > 0 ? Math.round((stat.cached / stat.total) * 100) : 0
                  const isRequired = requiredPixelSizes.includes(stat.pixelSize)
                  return (
                    <tr key={stat.pixelSize} className={`border-b border-border/50 ${isRequired ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}>
                      <td className="py-2 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={selectedSizes.has(stat.pixelSize)}
                          onChange={() => toggleSize(stat.pixelSize)}
                          className="rounded border-border"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <span className="font-mono">{stat.pixelSize}px</span>
                        {isRequired && (
                          <span className="ml-2 text-xs text-blue-600 dark:text-blue-400">(required)</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right text-green-600 font-medium">{stat.cached.toLocaleString()}</td>
                      <td className="py-2 px-3 text-right text-amber-600">{stat.needed.toLocaleString()}</td>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full ${percent === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                          <span className={`text-xs w-10 text-right ${percent === 100 ? 'text-green-600 font-medium' : 'text-muted-foreground'}`}>
                            {percent}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* No analysis yet message */}
        {sizeStats.length === 0 && !inProgress && (
          <div className="mb-4 p-4 rounded-lg bg-muted text-center">
            <p className="text-sm text-muted-foreground">
              Click &quot;Analyze&quot; to check S3 thumbnail cache status
            </p>
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={analyzeThumbnails}
            disabled={isAnalyzing || inProgress}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-border hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isAnalyzing ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <BarChart3 className="h-4 w-4" />
                Analyze Cache
              </>
            )}
          </button>
          <button
            onClick={generateThumbnails}
            disabled={inProgress || selectedSizes.size === 0}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {inProgress ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <ImageIcon className="h-4 w-4" />
                Generate Selected
              </>
            )}
          </button>
        </div>
      </div>
    </main>
  )
}
