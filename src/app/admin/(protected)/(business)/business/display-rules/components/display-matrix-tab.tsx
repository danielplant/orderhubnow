'use client'

import * as React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { CalculatedField, DisplayRule } from '../display-rules-client'

const SCENARIOS = [
  { key: 'ats', label: 'ATS (in stock)' },
  { key: 'preorder_po', label: 'PreOrder (PO Placed)' },
  { key: 'preorder_no_po', label: 'PreOrder (No PO Yet)' },
]

const VIEWS = [
  { key: 'admin_products', label: 'Admin Products' },
  { key: 'admin_inventory', label: 'Admin Inventory' },
  { key: 'admin_modal', label: 'Admin Modal' },
  { key: 'buyer_ats', label: 'Buyer ATS' },
  { key: 'buyer_preorder', label: 'Buyer PreOrder' },
  { key: 'rep_ats', label: 'Rep ATS' },
  { key: 'rep_preorder', label: 'Rep PreOrder' },
  { key: 'xlsx', label: 'XLSX Export' },
  { key: 'pdf', label: 'PDF Export' },
]

const RAW_FIELDS = ['on_hand', 'incoming', 'committed']

interface DisplayMatrixTabProps {
  displayRules: DisplayRule[]
  calculatedFields: CalculatedField[]
  onRefresh: () => Promise<void>
}

export function DisplayMatrixTab({ displayRules, calculatedFields, onRefresh }: DisplayMatrixTabProps) {
  const [editingCell, setEditingCell] = React.useState<{ scenario: string; view: string } | null>(null)
  const [fieldSource, setFieldSource] = React.useState('')
  const [label, setLabel] = React.useState('')
  const [rowBehavior, setRowBehavior] = React.useState('show')
  const [isSaving, setIsSaving] = React.useState(false)
  const [isResetting, setIsResetting] = React.useState(false)

  // Build a lookup map for quick access
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

  const allFieldOptions = React.useMemo(() => {
    const options = [
      { value: '(blank)', label: '(blank)' },
      ...RAW_FIELDS.map((f) => ({ value: f, label: f })),
      ...calculatedFields.map((f) => ({ value: f.name, label: `${f.name} (${f.formula})` })),
    ]
    return options
  }, [calculatedFields])

  const openEditDialog = (scenario: string, view: string) => {
    const rule = ruleMap[scenario]?.[view]
    setEditingCell({ scenario, view })
    setFieldSource(rule?.fieldSource || 'on_hand')
    setLabel(rule?.label || 'Available')
    setRowBehavior(rule?.rowBehavior || 'show')
  }

  const handleSave = async () => {
    if (!editingCell) return

    setIsSaving(true)
    try {
      const res = await fetch('/api/admin/display-rules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rules: [{
            scenario: editingCell.scenario,
            view: editingCell.view,
            fieldSource,
            label,
            rowBehavior,
          }],
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'Failed to save')
        return
      }

      setEditingCell(null)
      await onRefresh()
    } catch {
      alert('Failed to save display rule')
    } finally {
      setIsSaving(false)
    }
  }

  const handleReset = async () => {
    if (!confirm('Reset all display rules to defaults? This cannot be undone.')) {
      return
    }

    setIsResetting(true)
    try {
      const res = await fetch('/api/admin/display-rules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset: true }),
      })

      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'Failed to reset')
        return
      }

      await onRefresh()
    } catch {
      alert('Failed to reset display rules')
    } finally {
      setIsResetting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        Click any cell to configure what field is displayed for that scenario and view.
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Display Matrix</CardTitle>
          <CardDescription>
            3 scenarios × 9 views = 27 configurable display rules
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <div className="rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-3 py-2 text-left font-medium min-w-[160px]">Scenario</th>
                  {VIEWS.map((view) => (
                    <th key={view.key} className="px-3 py-2 text-left font-medium min-w-[100px]">
                      <div className="text-xs">{view.label}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SCENARIOS.map((scenario) => (
                  <tr key={scenario.key} className="border-t">
                    <td className="px-3 py-2 font-medium text-xs text-muted-foreground">
                      {scenario.label}
                    </td>
                    {VIEWS.map((view) => {
                      const rule = ruleMap[scenario.key]?.[view.key]
                      return (
                        <td key={`${scenario.key}-${view.key}`} className="px-3 py-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full h-auto py-2 px-2 flex flex-col items-start gap-0.5"
                            onClick={() => openEditDialog(scenario.key, view.key)}
                          >
                            <div className="text-xs font-medium truncate w-full text-left">
                              {rule?.label || '—'}
                            </div>
                            <div className="text-[10px] text-muted-foreground truncate w-full text-left">
                              {rule?.fieldSource || '—'}
                            </div>
                          </Button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Click a cell to edit. Changes are saved immediately.
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleReset}
          disabled={isResetting}
        >
          {isResetting ? 'Resetting...' : 'Reset to Defaults'}
        </Button>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingCell} onOpenChange={(open) => !open && setEditingCell(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Display Rule</DialogTitle>
            <DialogDescription>
              Configure what shows in this cell.
            </DialogDescription>
          </DialogHeader>

          {editingCell && (
            <div className="space-y-4">
              <div className="text-sm">
                <span className="text-muted-foreground">Scenario:</span>{' '}
                <span className="font-medium">
                  {SCENARIOS.find((s) => s.key === editingCell.scenario)?.label}
                </span>
                <br />
                <span className="text-muted-foreground">View:</span>{' '}
                <span className="font-medium">
                  {VIEWS.find((v) => v.key === editingCell.view)?.label}
                </span>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Field Source</label>
                <Select value={fieldSource} onValueChange={setFieldSource}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {allFieldOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Column Label</label>
                <Input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g., Available"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Row Behavior</label>
                <Select value={rowBehavior} onValueChange={setRowBehavior}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="show">Show row</SelectItem>
                    <SelectItem value="hide">Hide row</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingCell(null)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
