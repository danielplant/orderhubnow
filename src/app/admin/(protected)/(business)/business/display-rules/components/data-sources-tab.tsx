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
import { Plus, Pencil, Trash2 } from 'lucide-react'
import type { CalculatedField } from '../display-rules-client'

const RAW_FIELDS = [
  {
    key: 'on_hand',
    label: 'On Hand',
    source: 'inventoryLevel.available',
    description: 'Physical stock currently in the warehouse',
  },
  {
    key: 'incoming',
    label: 'Incoming',
    source: 'inventoryLevel.incoming',
    description: 'Quantity expected from factory (purchase order)',
  },
  {
    key: 'committed',
    label: 'Committed',
    source: 'inventoryLevel.committed',
    description: 'Quantity already sold or reserved',
  },
]

interface DataSourcesTabProps {
  calculatedFields: CalculatedField[]
  onRefresh: () => Promise<void>
}

export function DataSourcesTab({ calculatedFields, onRefresh }: DataSourcesTabProps) {
  const [isDialogOpen, setIsDialogOpen] = React.useState(false)
  const [editingField, setEditingField] = React.useState<CalculatedField | null>(null)
  const [name, setName] = React.useState('')
  const [formula, setFormula] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [isSaving, setIsSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const openCreateDialog = () => {
    setEditingField(null)
    setName('')
    setFormula('')
    setDescription('')
    setError(null)
    setIsDialogOpen(true)
  }

  const openEditDialog = (field: CalculatedField) => {
    setEditingField(field)
    setName(field.name)
    setFormula(field.formula)
    setDescription(field.description || '')
    setError(null)
    setIsDialogOpen(true)
  }

  const handleSave = async () => {
    setIsSaving(true)
    setError(null)

    try {
      const url = editingField 
        ? `/api/admin/calculated-fields/${editingField.id}`
        : '/api/admin/calculated-fields'
      
      const method = editingField ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, formula, description }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to save')
        return
      }

      setIsDialogOpen(false)
      await onRefresh()
    } catch {
      setError('Failed to save calculated field')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (field: CalculatedField) => {
    if (!confirm(`Are you sure you want to delete "${field.name}"?`)) {
      return
    }

    try {
      const res = await fetch(`/api/admin/calculated-fields/${field.id}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'Failed to delete')
        return
      }

      await onRefresh()
    } catch {
      alert('Failed to delete calculated field')
    }
  }

  return (
    <div className="space-y-6">
      {/* Raw Shopify Fields */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Raw Shopify Fields</CardTitle>
          <CardDescription>
            These fields are synced directly from Shopify inventory levels.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Field</th>
                  <th className="px-4 py-2 text-left font-medium">Shopify Source</th>
                  <th className="px-4 py-2 text-left font-medium">Description</th>
                </tr>
              </thead>
              <tbody>
                {RAW_FIELDS.map((field) => (
                  <tr key={field.key} className="border-t">
                    <td className="px-4 py-2">
                      <code className="bg-muted px-1.5 py-0.5 rounded text-xs">{field.key}</code>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground text-xs font-mono">
                      {field.source}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{field.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Calculated Fields */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Calculated Fields</CardTitle>
              <CardDescription>
                Create custom formulas using raw fields and arithmetic operators.
              </CardDescription>
            </div>
            <Button size="sm" className="gap-1" onClick={openCreateDialog}>
              <Plus className="size-4" />
              Add Field
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Name</th>
                  <th className="px-4 py-2 text-left font-medium">Formula</th>
                  <th className="px-4 py-2 text-left font-medium">Description</th>
                  <th className="px-4 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {calculatedFields.length === 0 ? (
                  <tr className="border-t">
                    <td colSpan={4} className="px-4 py-4 text-center text-muted-foreground">
                      No calculated fields yet. Click &quot;Add Field&quot; to create one.
                    </td>
                  </tr>
                ) : (
                  calculatedFields.map((field) => (
                    <tr key={field.id} className="border-t">
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <code className="bg-muted px-1.5 py-0.5 rounded text-xs">{field.name}</code>
                          {field.isSystem && (
                            <span className="text-[10px] bg-muted border border-border px-1.5 py-0.5 rounded">System</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2 font-mono text-xs">{field.formula}</td>
                      <td className="px-4 py-2 text-muted-foreground">{field.description || '—'}</td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="size-8 p-0"
                            onClick={() => openEditDialog(field)}
                            disabled={field.isSystem}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          {!field.isSystem && (
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="size-8 p-0 text-destructive"
                              onClick={() => handleDelete(field)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="rounded-lg border bg-muted/30 p-4">
        <p className="text-sm text-muted-foreground">
          <strong>Tip:</strong> Formulas support basic arithmetic: <code>+</code>, <code>-</code>,{' '}
          <code>*</code>, <code>/</code>, and parentheses. Use field names like{' '}
          <code>incoming</code> and <code>committed</code> in your formulas.
        </p>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingField ? 'Edit Calculated Field' : 'Add Calculated Field'}
            </DialogTitle>
            <DialogDescription>
              Create a formula using raw Shopify fields and arithmetic operators.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., total_available"
              />
              <p className="text-xs text-muted-foreground">
                Use lowercase letters and underscores only.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Formula</label>
              <Input
                value={formula}
                onChange={(e) => setFormula(e.target.value)}
                placeholder="e.g., incoming - committed"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Valid fields: <code>on_hand</code>, <code>incoming</code>, <code>committed</code>
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Description (optional)</label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g., Remaining units from factory PO"
              />
            </div>

            {error && (
              <div className="text-sm text-red-600">{error}</div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving || !name || !formula}>
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
