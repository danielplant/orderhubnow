'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { formatDateTime } from '@/lib/utils/format'
import {
  AVAILABILITY_LEGEND_TEXT,
  DEFAULT_SETTINGS,
  SCENARIOS,
  VIEWS,
  normalizeAvailabilitySettings,
} from '@/lib/availability/settings'
import type {
  AvailabilitySettingsRecord,
  AvailabilityScenario,
  AvailabilityView,
  AvailabilityCellConfig,
} from '@/lib/types/availability-settings'
import { computeAvailabilityDisplay } from '@/lib/availability/compute'

type ScenarioKey = 'ats' | 'preorder_incoming' | 'preorder_no_incoming'

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

interface PreviewResponse {
  samples: Record<ScenarioKey, PreviewRow[]>
}

interface AvailabilitySettingsPanelProps {
  initialSettings: AvailabilitySettingsRecord
  updatedAt?: string | null
  updatedBy?: string | null
  lastSyncTime?: string | null
  lastSyncStatus?: 'success' | 'partial' | 'failed' | 'never' | null
}

const SCENARIO_LABELS: Record<AvailabilityScenario, string> = {
  ats: 'ATS (in stock)',
  preorder_incoming: 'Pre‑Order (incoming PO)',
  preorder_no_incoming: 'Pre‑Order (no inbound PO)',
}

const VIEW_LABELS: Record<AvailabilityView, string> = {
  admin_products: 'Admin · Products',
  admin_inventory: 'Admin · Inventory',
  xlsx: 'XLSX Export',
  pdf: 'PDF Export',
  buyer_products: 'Buyer · ATS',
  buyer_preorder: 'Buyer · Pre‑Order',
  rep_products: 'Rep · ATS',
  rep_preorder: 'Rep · Pre‑Order',
}

const VALUE_SOURCE_LABELS: Record<AvailabilityCellConfig['valueSource'], string> = {
  quantity: 'Quantity (ATS stock)',
  onRoute: 'On Route (incoming − committed)',
  incoming: 'Incoming (raw)',
  customText: 'Custom text',
}

const ZERO_NULL_LABELS: Record<AvailabilityCellConfig['zeroNullDisplay'], string> = {
  zero: 'Show 0',
  blank: 'Blank',
  customText: 'Custom text',
}

export function AvailabilitySettingsPanel({
  initialSettings,
  updatedAt,
  updatedBy,
  lastSyncTime,
  lastSyncStatus,
}: AvailabilitySettingsPanelProps) {
  const [settings, setSettings] = React.useState<AvailabilitySettingsRecord>(() =>
    normalizeAvailabilitySettings(initialSettings)
  )
  const [status, setStatus] = React.useState<{ kind: 'success' | 'error'; message: string } | null>(null)
  const [isSaving, setIsSaving] = React.useState(false)
  const [editing, setEditing] = React.useState<{ scenario: AvailabilityScenario; view: AvailabilityView } | null>(null)
  const [preview, setPreview] = React.useState<PreviewResponse | null>(null)
  const [isPreviewLoading, setIsPreviewLoading] = React.useState(false)
  const [syncStatus, setSyncStatus] = React.useState<{ kind: 'success' | 'error'; message: string } | null>(null)
  const [isSyncing, setIsSyncing] = React.useState(false)

  React.useEffect(() => {
    let active = true
    async function loadPreview() {
      setIsPreviewLoading(true)
      try {
        const res = await fetch('/api/admin/availability-settings/preview')
        if (!res.ok) throw new Error('Failed to load preview')
        const data = (await res.json()) as PreviewResponse
        if (active) setPreview(data)
      } catch {
        if (active) setPreview(null)
      } finally {
        if (active) setIsPreviewLoading(false)
      }
    }

    loadPreview()
    return () => {
      active = false
    }
  }, [])

  function updateCell(
    scenario: AvailabilityScenario,
    view: AvailabilityView,
    patch: Partial<AvailabilityCellConfig>
  ) {
    setSettings((prev) => ({
      ...prev,
      matrix: {
        ...prev.matrix,
        [scenario]: {
          ...prev.matrix[scenario],
          [view]: {
            ...prev.matrix[scenario][view],
            ...patch,
          },
        },
      },
    }))
  }

  function updateSetting<K extends keyof AvailabilitySettingsRecord>(key: K, value: AvailabilitySettingsRecord[K]) {
    setSettings((prev) => ({
      ...prev,
      [key]: value,
    }))
  }

  async function handleSave() {
    setIsSaving(true)
    setStatus(null)

    try {
      const res = await fetch('/api/admin/availability-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Failed to save')

      setStatus({ kind: 'success', message: 'Availability settings saved.' })
    } catch (err) {
      setStatus({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Failed to save availability settings.',
      })
    } finally {
      setIsSaving(false)
    }
  }

  function handleResetDefaults() {
    setSettings(DEFAULT_SETTINGS)
    setStatus(null)
  }

  async function handleRecomputeNow() {
    setIsSyncing(true)
    setSyncStatus(null)
    try {
      const res = await fetch('/api/admin/sync-shopify', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error ?? 'Failed to trigger sync')
      }
      setSyncStatus({ kind: 'success', message: 'Sync started. Changes apply after it completes.' })
    } catch (err) {
      setSyncStatus({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Failed to start sync.',
      })
    } finally {
      setIsSyncing(false)
    }
  }

  const editingCell = editing
    ? settings.matrix[editing.scenario][editing.view]
    : null

  const lastSyncLabel = lastSyncTime ? formatDateTime(lastSyncTime) : '—'

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Availability Rules</CardTitle>
          <CardDescription>
            Configure how “Available” is computed for each scenario and view. Blank means
            “no inbound PO yet” for Pre‑Order.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-lg border border-border overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Scenario</th>
                  {VIEWS.map((view) => (
                    <th key={view} className="px-3 py-2 text-left font-medium">
                      {VIEW_LABELS[view]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SCENARIOS.map((scenario) => (
                  <tr key={scenario} className="border-t">
                    <td className="px-3 py-2 text-xs font-medium text-muted-foreground">
                      {SCENARIO_LABELS[scenario]}
                    </td>
                    {VIEWS.map((view) => {
                      const cell = settings.matrix[scenario][view]
                      const zeroLabel = cell.zeroNullDisplay === 'customText'
                        ? `Custom: “${cell.zeroNullCustomText ?? ''}”`
                        : ZERO_NULL_LABELS[cell.zeroNullDisplay]
                      const valueLabel = cell.valueSource === 'customText'
                        ? `Custom: “${cell.customValue ?? ''}”`
                        : VALUE_SOURCE_LABELS[cell.valueSource]

                      return (
                        <td key={`${scenario}-${view}`} className="px-3 py-2 align-top">
                          <div className="space-y-1">
                            <div className="text-sm font-medium">{cell.label}</div>
                            <div className="text-xs text-muted-foreground">{valueLabel}</div>
                            <div className="text-xs text-muted-foreground">{zeroLabel}</div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs"
                              onClick={() => setEditing({ scenario, view })}
                            >
                              Edit
                            </Button>
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-dashed">
              <CardHeader>
                <CardTitle className="text-base">On Route column</CardTitle>
                <CardDescription>Control visibility and labels for the optional On Route column.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">Admin Products</div>
                    <div className="text-xs text-muted-foreground">Show column + label</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={settings.showOnRouteProducts}
                      onCheckedChange={(val) => updateSetting('showOnRouteProducts', Boolean(val))}
                    />
                    <Input
                      className="w-32"
                      value={settings.onRouteLabelProducts}
                      onChange={(e) => updateSetting('onRouteLabelProducts', e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">Admin Inventory</div>
                    <div className="text-xs text-muted-foreground">Show column + label</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={settings.showOnRouteInventory}
                      onCheckedChange={(val) => updateSetting('showOnRouteInventory', Boolean(val))}
                    />
                    <Input
                      className="w-32"
                      value={settings.onRouteLabelInventory}
                      onChange={(e) => updateSetting('onRouteLabelInventory', e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">XLSX Export</div>
                    <div className="text-xs text-muted-foreground">Show column + label</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={settings.showOnRouteXlsx}
                      onCheckedChange={(val) => updateSetting('showOnRouteXlsx', Boolean(val))}
                    />
                    <Input
                      className="w-32"
                      value={settings.onRouteLabelXlsx}
                      onChange={(e) => updateSetting('onRouteLabelXlsx', e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">PDF Export</div>
                    <div className="text-xs text-muted-foreground">Show column + label</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={settings.showOnRoutePdf}
                      onCheckedChange={(val) => updateSetting('showOnRoutePdf', Boolean(val))}
                    />
                    <Input
                      className="w-32"
                      value={settings.onRouteLabelPdf}
                      onChange={(e) => updateSetting('onRouteLabelPdf', e.target.value)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-dashed">
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
                    value={settings.legendText}
                    onChange={(e) => updateSetting('legendText', e.target.value)}
                    placeholder="Footer text for exports..."
                  />
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium">Show legend when export contains:</div>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="showLegendAts"
                        checked={settings.showLegendAts}
                        onCheckedChange={(val) => updateSetting('showLegendAts', Boolean(val))}
                      />
                      <label htmlFor="showLegendAts" className="cursor-pointer">
                        ATS (in stock) items
                      </label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="showLegendPreorderIncoming"
                        checked={settings.showLegendPreorderIncoming}
                        onCheckedChange={(val) => updateSetting('showLegendPreorderIncoming', Boolean(val))}
                      />
                      <label htmlFor="showLegendPreorderIncoming" className="cursor-pointer">
                        Pre-Order items with incoming PO
                      </label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="showLegendPreorderNoIncoming"
                        checked={settings.showLegendPreorderNoIncoming}
                        onCheckedChange={(val) => updateSetting('showLegendPreorderNoIncoming', Boolean(val))}
                      />
                      <label htmlFor="showLegendPreorderNoIncoming" className="cursor-pointer">
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
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-dashed">
              <CardHeader>
                <CardTitle className="text-base">Live preview (real SKUs)</CardTitle>
                <CardDescription>
                  Uses actual data from Shopify sync. {AVAILABILITY_LEGEND_TEXT}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                {isPreviewLoading && <div className="text-muted-foreground">Loading preview…</div>}
                {!isPreviewLoading && !preview && (
                  <div className="text-muted-foreground">Preview unavailable. Try again later.</div>
                )}
                {!isPreviewLoading && preview && (
                  <div className="space-y-3">
                    {(['ats', 'preorder_incoming', 'preorder_no_incoming'] as ScenarioKey[]).map((scenario) => (
                      <div key={scenario}>
                        <div className="text-xs font-medium text-muted-foreground mb-1">
                          {SCENARIO_LABELS[scenario as AvailabilityScenario]}
                        </div>
                        <div className="space-y-2">
                          {preview.samples[scenario]?.length ? (
                            preview.samples[scenario].map((row) => {
                              const result = computeAvailabilityDisplay(
                                scenario as AvailabilityScenario,
                                'admin_products',
                                {
                                  quantity: row.quantity,
                                  onRoute: row.onRoute,
                                  incoming: row.incoming,
                                  committed: row.committed,
                                },
                                settings
                              )
                              return (
                                <div key={row.skuId} className="flex items-center justify-between rounded border px-2 py-1">
                                  <div>
                                    <div className="font-medium">{row.skuId}</div>
                                    <div className="text-xs text-muted-foreground">{row.collectionName ?? '—'}</div>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-sm font-semibold">
                                      {result.display === '' ? '—' : result.display}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground">
                                      Incoming: {row.incoming ?? '—'} · Committed: {row.committed ?? '—'}
                                    </div>
                                  </div>
                                </div>
                              )
                            })
                          ) : (
                            <div className="text-xs text-muted-foreground">No sample SKUs found.</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <div className="text-xs text-muted-foreground space-y-1">
              <div>Last sync: {lastSyncLabel} ({lastSyncStatus ?? '—'})</div>
              <div>Changes apply after the next sync completes.</div>
              {updatedAt && (
                <div>Last updated: {formatDateTime(updatedAt)} {updatedBy ? `by ${updatedBy}` : ''}</div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={handleRecomputeNow} disabled={isSyncing}>
                {isSyncing ? 'Starting sync…' : 'Recompute now'}
              </Button>
              <Button variant="outline" onClick={handleResetDefaults} disabled={isSaving}>
                Reset defaults
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? 'Saving…' : 'Save settings'}
              </Button>
            </div>
          </div>

          {status && (
            <div className={cn('text-sm', status.kind === 'success' ? 'text-emerald-600' : 'text-red-600')}>
              {status.message}
            </div>
          )}
          {syncStatus && (
            <div className={cn('text-sm', syncStatus.kind === 'success' ? 'text-emerald-600' : 'text-red-600')}>
              {syncStatus.message}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Configure Availability Cell</DialogTitle>
            <DialogDescription>
              Adjust label, value source, and how zero/null values display.
            </DialogDescription>
          </DialogHeader>
          {editingCell && editing && (
            <div className="space-y-4">
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">{SCENARIO_LABELS[editing.scenario]}</div>
                <div className="text-sm font-medium">{VIEW_LABELS[editing.view]}</div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Column label</label>
                <Input
                  value={editingCell.label}
                  onChange={(e) => updateCell(editing.scenario, editing.view, { label: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Value source</label>
                <Select
                  value={editingCell.valueSource}
                  onValueChange={(value) =>
                    updateCell(editing.scenario, editing.view, { valueSource: value as AvailabilityCellConfig['valueSource'] })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(VALUE_SOURCE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {editingCell.valueSource === 'customText' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Custom text</label>
                  <Input
                    value={editingCell.customValue ?? ''}
                    onChange={(e) => updateCell(editing.scenario, editing.view, { customValue: e.target.value })}
                  />
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium">Zero / null display</label>
                <Select
                  value={editingCell.zeroNullDisplay}
                  onValueChange={(value) =>
                    updateCell(editing.scenario, editing.view, { zeroNullDisplay: value as AvailabilityCellConfig['zeroNullDisplay'] })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ZERO_NULL_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {editingCell.zeroNullDisplay === 'customText' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Zero/null custom text</label>
                  <Input
                    value={editingCell.zeroNullCustomText ?? ''}
                    onChange={(e) => updateCell(editing.scenario, editing.view, { zeroNullCustomText: e.target.value })}
                  />
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
