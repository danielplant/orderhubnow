'use client'

import * as React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Search } from 'lucide-react'
import type { CalculatedField, DisplayRule } from '../display-rules-client'

const VIEWS = [
  { key: 'admin_products', label: 'Admin Products' },
  { key: 'admin_inventory', label: 'Admin Inventory' },
  { key: 'buyer_ats', label: 'Buyer ATS' },
  { key: 'buyer_preorder', label: 'Buyer PreOrder' },
  { key: 'xlsx', label: 'XLSX Export' },
  { key: 'pdf', label: 'PDF Export' },
]

interface PreviewRow {
  skuId: string
  description: string
  collectionName: string | null
  collectionType: string | null
  quantity: number
  onRoute: number
  incoming: number | null
  committed: number | null
  onHand: number | null
}

interface PreviewTabProps {
  displayRules: DisplayRule[]
  calculatedFields: CalculatedField[]
}

export function PreviewTab({ displayRules, calculatedFields }: PreviewTabProps) {
  const [selectedView, setSelectedView] = React.useState('buyer_preorder')
  const [legendText, setLegendText] = React.useState('Blank means no inbound PO yet — pre-order allowed.')
  const [showLegendAts, setShowLegendAts] = React.useState(false)
  const [showLegendPreorderPo, setShowLegendPreorderPo] = React.useState(false)
  const [showLegendPreorderNoPo, setShowLegendPreorderNoPo] = React.useState(true)

  // Single SKU search state
  const [searchInput, setSearchInput] = React.useState('')
  const [previewSku, setPreviewSku] = React.useState<PreviewRow | null>(null)
  const [previewScenario, setPreviewScenario] = React.useState<string | null>(null)
  const [previewMessage, setPreviewMessage] = React.useState<string>('Enter a SKU ID to preview display rules.')
  const [isLoadingPreview, setIsLoadingPreview] = React.useState(false)
  const [hasSearched, setHasSearched] = React.useState(false)

  // Search for a SKU
  const handleSearch = React.useCallback(async () => {
    if (!searchInput.trim()) {
      setPreviewMessage('Enter a SKU ID to preview display rules.')
      setPreviewSku(null)
      setPreviewScenario(null)
      setHasSearched(false)
      return
    }

    setIsLoadingPreview(true)
    setHasSearched(true)
    try {
      const res = await fetch(`/api/admin/display-rules/preview?sku=${encodeURIComponent(searchInput.trim())}`)
      if (res.ok) {
        const data = await res.json()
        setPreviewSku(data.sku || null)
        setPreviewScenario(data.scenario || null)
        setPreviewMessage(data.message || '')
      }
    } catch (err) {
      console.error('Failed to load preview:', err)
      setPreviewMessage('Failed to load preview.')
    } finally {
      setIsLoadingPreview(false)
    }
  }, [searchInput])

  // Handle Enter key in search input
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  // Build rule lookup
  const ruleMap = React.useMemo(() => {
    const map: Record<string, Record<string, DisplayRule>> = {}
    for (const rule of displayRules) {
      if (!map[rule.scenario]) {
        map[rule.scenario] = {}
      }
      map[rule.scenario][rule.view] = rule
    }
    return map
  }, [displayRules])

  // Build formula lookup
  const formulaMap = React.useMemo(() => {
    const map: Record<string, string> = {}
    for (const field of calculatedFields) {
      map[field.name] = field.formula
    }
    return map
  }, [calculatedFields])

  // Compute display value for a row
  const computeDisplayValue = (scenario: string, row: PreviewRow): string => {
    const rule = ruleMap[scenario]?.[selectedView]
    if (!rule) return '—'

    const fieldSource = rule.fieldSource

    if (fieldSource === '(blank)') {
      return '—'
    }

    // Raw fields — use actual on_hand from inventory level when available,
    // falling back to Sku.Quantity (which is inventoryQuantity/available)
    const onHandValue = row.onHand ?? row.quantity
    if (fieldSource === 'on_hand') {
      return String(onHandValue)
    }
    if (fieldSource === 'incoming') {
      return row.incoming != null ? String(row.incoming) : '—'
    }
    if (fieldSource === 'committed') {
      return row.committed != null ? String(row.committed) : '—'
    }

    // Calculated fields - simple evaluation
    const formula = formulaMap[fieldSource]
    if (formula) {
      try {
        // Simple formula evaluation (only supports basic arithmetic)
        let expr = formula
        expr = expr.replace(/on_hand/g, String(onHandValue))
        expr = expr.replace(/incoming/g, String(row.incoming ?? 0))
        expr = expr.replace(/committed/g, String(row.committed ?? 0))
        
        // Use Function for safe evaluation of arithmetic
         
        const result = new Function(`return ${expr}`)()
        return String(Math.round(result))
      } catch {
        return '?'
      }
    }

    return '—'
  }

  // Get human-readable scenario label
  const getScenarioLabel = (scenario: string | null): string => {
    if (scenario === 'ats') return 'ATS (in stock)'
    if (scenario === 'preorder_po') return 'PreOrder (PO Placed)'
    if (scenario === 'preorder_no_po') return 'PreOrder (No PO Yet)'
    return 'Unknown'
  }

  return (
    <div className="space-y-6">
      {/* Preview Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Live Preview</CardTitle>
              <CardDescription>
                Search for a SKU to see how display rules apply.
              </CardDescription>
            </div>
            <Select value={selectedView} onValueChange={setSelectedView}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VIEWS.map((view) => (
                  <SelectItem key={view.key} value={view.key}>
                    {view.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search Input */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                placeholder="Enter SKU ID (e.g. ABC123-SM)"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={handleKeyDown}
                className="pr-10"
              />
            </div>
            <Button onClick={handleSearch} disabled={isLoadingPreview}>
              <Search className="h-4 w-4 mr-2" />
              Search
            </Button>
          </div>

          {/* Result */}
          {isLoadingPreview ? (
            <div className="text-muted-foreground text-sm">Searching...</div>
          ) : previewSku && previewScenario ? (
            <div className="space-y-3">
              <div className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                Scenario: {getScenarioLabel(previewScenario)}
                {ruleMap[previewScenario]?.[selectedView] && (
                  <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">
                    {ruleMap[previewScenario][selectedView].label}: {ruleMap[previewScenario][selectedView].fieldSource}
                  </span>
                )}
              </div>
              <div className="rounded border px-4 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">{previewSku.skuId}</div>
                    <div className="text-sm text-muted-foreground">{previewSku.description}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Collection: {previewSku.collectionName ?? '(none)'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold">
                      {computeDisplayValue(previewScenario, previewSku)}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Display value for {VIEWS.find(v => v.key === selectedView)?.label}
                    </div>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t grid grid-cols-4 gap-2 text-xs">
                  <div>
                    <div className="text-muted-foreground">On Hand</div>
                    <div className="font-medium">{previewSku.quantity}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">On Route</div>
                    <div className="font-medium">{previewSku.onRoute}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Incoming</div>
                    <div className="font-medium">{previewSku.incoming ?? '—'}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Committed</div>
                    <div className="font-medium">{previewSku.committed ?? '—'}</div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground py-4 text-center">
              {hasSearched ? previewMessage : 'Enter a SKU ID above and click Search to preview display rules.'}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Legend Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Export Legend / Footer Text</CardTitle>
          <CardDescription>
            Configure the footer text shown at the bottom of XLSX and PDF exports.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Legend text</label>
            <Input
              value={legendText}
              onChange={(e) => setLegendText(e.target.value)}
              placeholder="Footer text for exports..."
            />
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">Show legend when export contains:</div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="showLegendAts"
                  checked={showLegendAts}
                  onCheckedChange={(val) => setShowLegendAts(Boolean(val))}
                />
                <label htmlFor="showLegendAts" className="cursor-pointer">
                  ATS (in stock) items
                </label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="showLegendPreorderPo"
                  checked={showLegendPreorderPo}
                  onCheckedChange={(val) => setShowLegendPreorderPo(Boolean(val))}
                />
                <label htmlFor="showLegendPreorderPo" className="cursor-pointer">
                  Pre-Order items with incoming PO
                </label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="showLegendPreorderNoPo"
                  checked={showLegendPreorderNoPo}
                  onCheckedChange={(val) => setShowLegendPreorderNoPo(Boolean(val))}
                />
                <label htmlFor="showLegendPreorderNoPo" className="cursor-pointer">
                  Pre-Order items with no inbound PO
                </label>
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              Legend appears at the bottom of XLSX/PDF if ANY item in the export matches a checked scenario.
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Info */}
      <div className="rounded-lg border bg-muted/30 p-4">
        <p className="text-sm text-muted-foreground">
          <strong>Note:</strong> Display rules are saved immediately when you edit them in the 
          Display Matrix tab. Legend settings are stored separately in Availability Settings.
        </p>
      </div>
    </div>
  )
}
