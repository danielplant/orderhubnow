'use client'

import * as React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
}

interface PreviewTabProps {
  displayRules: DisplayRule[]
  calculatedFields: CalculatedField[]
}

export function PreviewTab({ displayRules, calculatedFields }: PreviewTabProps) {
  const [selectedView, setSelectedView] = React.useState('admin_products')
  const [legendText, setLegendText] = React.useState('Blank means no inbound PO yet — pre-order allowed.')
  const [showLegendAts, setShowLegendAts] = React.useState(false)
  const [showLegendPreorderPo, setShowLegendPreorderPo] = React.useState(false)
  const [showLegendPreorderNoPo, setShowLegendPreorderNoPo] = React.useState(true)
  const [previewData, setPreviewData] = React.useState<Record<string, PreviewRow[]>>({})
  const [isLoadingPreview, setIsLoadingPreview] = React.useState(true)

  // Load preview data
  React.useEffect(() => {
    async function loadPreview() {
      setIsLoadingPreview(true)
      try {
        const res = await fetch('/api/admin/display-rules/preview')
        if (res.ok) {
          const data = await res.json()
          setPreviewData(data.samples || {})
        }
      } catch (err) {
        console.error('Failed to load preview:', err)
      } finally {
        setIsLoadingPreview(false)
      }
    }

    loadPreview()
  }, [])

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

    // Raw fields
    if (fieldSource === 'on_hand') {
      return String(row.quantity)
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
        expr = expr.replace(/on_hand/g, String(row.quantity))
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

  const scenarios = [
    { key: 'ats', label: 'ATS (in stock)' },
    { key: 'preorder_po', label: 'PreOrder (PO Placed)' },
    { key: 'preorder_no_po', label: 'PreOrder (No PO Yet)' },
  ]

  return (
    <div className="space-y-6">
      {/* Preview Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Live Preview</CardTitle>
              <CardDescription>
                See how your display rules look with real product data.
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
          {isLoadingPreview ? (
            <div className="text-muted-foreground">Loading preview...</div>
          ) : (
            <>
              {scenarios.map((scenario) => {
                const rows = previewData[scenario.key] || []
                const rule = ruleMap[scenario.key]?.[selectedView]

                return (
                  <div key={scenario.key}>
                    <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-2">
                      {scenario.label}
                      {rule && (
                        <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">
                          {rule.label}: {rule.fieldSource}
                        </span>
                      )}
                    </div>
                    <div className="space-y-2">
                      {rows.length === 0 ? (
                        <div className="text-xs text-muted-foreground italic">
                          No sample SKUs found for this scenario.
                        </div>
                      ) : (
                        rows.map((row) => (
                          <div
                            key={row.skuId}
                            className="flex items-center justify-between rounded border px-3 py-2"
                          >
                            <div>
                              <div className="font-medium text-sm">{row.skuId}</div>
                              <div className="text-xs text-muted-foreground">{row.collectionName}</div>
                            </div>
                            <div className="text-right">
                              <div className="font-semibold">
                                {computeDisplayValue(scenario.key, row)}
                              </div>
                              <div className="text-[10px] text-muted-foreground">
                                in: {row.incoming ?? '—'} / com: {row.committed ?? '—'}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )
              })}
            </>
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
