'use client'

import { useState, useEffect } from 'react'
import { Settings, Image, Database, Clock, History, RotateCcw, Save } from 'lucide-react'
import { formatDateTime } from '@/lib/utils/format'

interface SyncSettings {
  id: number
  version: number
  thumbnailSettingsVersion: number
  thumbnailSizeSm: number
  thumbnailSizeMd: number
  thumbnailSizeLg: number
  thumbnailSizeXl: number
  thumbnailQuality: number
  thumbnailFit: string
  thumbnailBackground: string
  thumbnailFetchTimeoutMs: number
  thumbnailBatchConcurrency: number
  thumbnailEnabled: boolean
  backupEnabled: boolean
  backupRetentionDays: number
  cleanupStaleBackups: boolean
  syncMaxWaitMs: number
  syncPollIntervalMs: number
  updatedAt: string
}

interface SettingsHistory {
  id: number
  settingsId: number
  version: number
  snapshot: string
  changedBy: string | null
  changedAt: string
  changeNote: string | null
}

export default function SyncSettingsPage() {
  const [settings, setSettings] = useState<SyncSettings | null>(null)
  const [history, setHistory] = useState<SettingsHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Form state
  const [formData, setFormData] = useState<Partial<SyncSettings>>({})

  // Fetch settings on mount
  useEffect(() => {
    fetchSettings()
    fetchHistory()
  }, [])

  async function fetchSettings() {
    try {
      const res = await fetch('/api/admin/shopify/settings')
      if (!res.ok) throw new Error('Failed to fetch settings')
      const data = await res.json()
      setSettings(data.settings)
      setFormData(data.settings)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }

  async function fetchHistory() {
    try {
      const res = await fetch('/api/admin/shopify/settings/history')
      if (!res.ok) return
      const data = await res.json()
      setHistory(data.history || [])
    } catch {
      // Ignore history errors
    }
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await fetch('/api/admin/shopify/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save settings')

      setSuccess('Settings saved successfully')
      fetchSettings()
      fetchHistory()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  async function handleRestore(historyId: number) {
    if (!confirm('Restore settings from this version? Current settings will be saved to history.')) {
      return
    }

    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await fetch('/api/admin/shopify/settings/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ historyId }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to restore settings')

      setSuccess('Settings restored successfully')
      fetchSettings()
      fetchHistory()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restore settings')
    } finally {
      setSaving(false)
    }
  }

  function updateForm(field: keyof SyncSettings, value: unknown) {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  if (loading) {
    return (
      <main className="p-6">
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          Loading settings...
        </div>
      </main>
    )
  }

  return (
    <main className="p-6">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Settings className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Sync Settings</h1>
        </div>
        <p className="text-muted-foreground">
          Configure thumbnail generation, backups, and sync behavior
        </p>
        {settings && (
          <p className="text-xs text-muted-foreground mt-1">
            Version {settings.version} | Last updated: {formatDateTime(settings.updatedAt)}
          </p>
        )}
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-lg border border-red-200 bg-red-50 text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-6 p-4 rounded-lg border border-green-200 bg-green-50 text-green-700">
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Thumbnail Configuration */}
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Image className="h-5 w-5 text-muted-foreground" />
            <h2 className="font-semibold">Thumbnail Configuration</h2>
          </div>

          <div className="space-y-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.thumbnailEnabled ?? true}
                onChange={e => updateForm('thumbnailEnabled', e.target.checked)}
                className="rounded border-border"
              />
              <span className="text-sm">Enable thumbnail generation</span>
            </label>

            <div className="grid grid-cols-4 gap-4">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Small (px)</label>
                <input
                  type="number"
                  value={formData.thumbnailSizeSm ?? 120}
                  onChange={e => updateForm('thumbnailSizeSm', parseInt(e.target.value))}
                  className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Medium (px)</label>
                <input
                  type="number"
                  value={formData.thumbnailSizeMd ?? 240}
                  onChange={e => updateForm('thumbnailSizeMd', parseInt(e.target.value))}
                  className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Large (px)</label>
                <input
                  type="number"
                  value={formData.thumbnailSizeLg ?? 480}
                  onChange={e => updateForm('thumbnailSizeLg', parseInt(e.target.value))}
                  className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">XL (px)</label>
                <input
                  type="number"
                  value={formData.thumbnailSizeXl ?? 720}
                  onChange={e => updateForm('thumbnailSizeXl', parseInt(e.target.value))}
                  className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Quality (1-100)</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={formData.thumbnailQuality ?? 80}
                  onChange={e => updateForm('thumbnailQuality', parseInt(e.target.value))}
                  className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Fit Mode</label>
                <select
                  value={formData.thumbnailFit ?? 'contain'}
                  onChange={e => updateForm('thumbnailFit', e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm"
                >
                  <option value="contain">Contain</option>
                  <option value="cover">Cover</option>
                  <option value="fill">Fill</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Background Color</label>
                <input
                  type="text"
                  value={formData.thumbnailBackground ?? '#FFFFFF'}
                  onChange={e => updateForm('thumbnailBackground', e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm font-mono"
                  placeholder="#FFFFFF"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Batch Concurrency</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={formData.thumbnailBatchConcurrency ?? 10}
                  onChange={e => updateForm('thumbnailBatchConcurrency', parseInt(e.target.value))}
                  className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm"
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Thumbnail settings version: {formData.thumbnailSettingsVersion ?? 5}
              <br />
              Changing sizes or quality will increment this version, triggering regeneration.
            </p>
          </div>
        </div>

        {/* Backup Configuration */}
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Database className="h-5 w-5 text-muted-foreground" />
            <h2 className="font-semibold">Backup Configuration</h2>
          </div>

          <div className="space-y-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.backupEnabled ?? true}
                onChange={e => updateForm('backupEnabled', e.target.checked)}
                className="rounded border-border"
              />
              <span className="text-sm">Enable pre-sync backups</span>
            </label>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.cleanupStaleBackups ?? true}
                onChange={e => updateForm('cleanupStaleBackups', e.target.checked)}
                className="rounded border-border"
              />
              <span className="text-sm">Auto-cleanup old backups</span>
            </label>

            <div>
              <label className="block text-xs text-muted-foreground mb-1">Retention Period (days)</label>
              <input
                type="number"
                min={1}
                max={365}
                value={formData.backupRetentionDays ?? 7}
                onChange={e => updateForm('backupRetentionDays', parseInt(e.target.value))}
                className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm"
              />
            </div>

            <p className="text-xs text-muted-foreground">
              Backups older than the retention period will be automatically deleted after each sync.
            </p>
          </div>
        </div>

        {/* Sync Configuration */}
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="h-5 w-5 text-muted-foreground" />
            <h2 className="font-semibold">Sync Configuration</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Max Wait Time (ms)</label>
              <input
                type="number"
                min={60000}
                max={3600000}
                value={formData.syncMaxWaitMs ?? 600000}
                onChange={e => updateForm('syncMaxWaitMs', parseInt(e.target.value))}
                className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {Math.round((formData.syncMaxWaitMs ?? 600000) / 60000)} minutes
              </p>
            </div>

            <div>
              <label className="block text-xs text-muted-foreground mb-1">Poll Interval (ms)</label>
              <input
                type="number"
                min={1000}
                max={60000}
                value={formData.syncPollIntervalMs ?? 3000}
                onChange={e => updateForm('syncPollIntervalMs', parseInt(e.target.value))}
                className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {(formData.syncPollIntervalMs ?? 3000) / 1000} seconds between status checks
              </p>
            </div>
          </div>
        </div>

        {/* Settings History */}
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <History className="h-5 w-5 text-muted-foreground" />
            <h2 className="font-semibold">Settings History</h2>
          </div>

          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No history available</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {history.map(entry => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between p-2 rounded border border-border text-sm"
                >
                  <div>
                    <p className="font-medium">Version {entry.version}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(entry.changedAt)}
                      {entry.changedBy && ` by ${entry.changedBy}`}
                    </p>
                    {entry.changeNote && (
                      <p className="text-xs text-muted-foreground italic">{entry.changeNote}</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleRestore(entry.id)}
                    disabled={saving}
                    className="p-1.5 rounded border border-border hover:bg-accent disabled:opacity-50"
                    title="Restore this version"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Save Button */}
      <div className="mt-6 flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </main>
  )
}
