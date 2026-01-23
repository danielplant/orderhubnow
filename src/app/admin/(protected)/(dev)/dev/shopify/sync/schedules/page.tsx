'use client';

import { useState, useEffect, useCallback } from 'react';
import { Clock, Plus, Trash2, Play, Pause, AlertTriangle } from 'lucide-react';
import { formatDateTime } from '@/lib/utils/format';

interface Schedule {
  id: string;
  mappingId: string;
  mappingName: string;
  type: 'full' | 'incremental';
  cronPattern: string;
  timezone: string;
  enabled: boolean;
  nextRun?: string;
  lastRun?: string;
  lastStatus?: 'success' | 'failed' | 'running';
}

interface Mapping {
  id: string;
  name: string;
}

export default function SchedulesPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [redisAvailable, setRedisAvailable] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const [newSchedule, setNewSchedule] = useState({
    mappingId: '',
    type: 'incremental' as 'full' | 'incremental',
    cronPattern: '0 */6 * * *',
    timezone: 'UTC',
  });

  const loadData = useCallback(async () => {
    try {
      const [schedulesRes, mappingsRes] = await Promise.all([
        fetch('/api/admin/shopify/sync/schedules'),
        fetch('/api/admin/shopify/sync/mapping'),
      ]);

      const schedulesData = await schedulesRes.json();
      const mappingsData = await mappingsRes.json();

      if (!schedulesRes.ok) {
        if (schedulesData.error?.code === 'REDIS_UNAVAILABLE') {
          setRedisAvailable(false);
        } else {
          throw new Error(schedulesData.error?.message || 'Failed to load schedules');
        }
      } else {
        setSchedules(schedulesData.schedules || []);
        setRedisAvailable(true);
      }

      setMappings(mappingsData.mappings || []);
      if (mappingsData.mappings?.length > 0 && !newSchedule.mappingId) {
        setNewSchedule((prev) => ({ ...prev, mappingId: mappingsData.mappings[0].id }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [newSchedule.mappingId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const createSchedule = async () => {
    try {
      const res = await fetch('/api/admin/shopify/sync/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSchedule),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to create schedule');
      }

      setShowCreateForm(false);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create schedule');
    }
  };

  const toggleSchedule = async (schedule: Schedule) => {
    try {
      const res = await fetch(`/api/admin/shopify/sync/schedules/${schedule.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !schedule.enabled }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || 'Failed to update schedule');
      }

      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update schedule');
    }
  };

  const deleteSchedule = async (id: string) => {
    if (!confirm('Are you sure you want to delete this schedule?')) return;

    try {
      const res = await fetch(`/api/admin/shopify/sync/schedules/${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || 'Failed to delete schedule');
      }

      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete schedule');
    }
  };

  const formatNextRun = (dateStr?: string) => {
    if (!dateStr) return 'Not scheduled';
    return formatDateTime(dateStr);
  };

  if (loading) {
    return (
      <main className="p-6">
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          Loading...
        </div>
      </main>
    );
  }

  if (!redisAvailable) {
    return (
      <main className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Schedules</h1>
          <p className="text-muted-foreground mt-1">
            Schedule automatic sync operations
          </p>
        </div>

        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-8 text-center">
          <AlertTriangle className="h-12 w-12 mx-auto text-yellow-500 mb-4" />
          <p className="text-lg font-medium mb-2">Scheduling Unavailable</p>
          <p className="text-muted-foreground">
            Scheduling requires Redis. Set the REDIS_URL environment variable to enable scheduled syncs.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Schedules</h1>
          <p className="text-muted-foreground mt-1">
            Schedule automatic sync operations
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          New Schedule
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-lg border border-red-200 bg-red-50 text-red-700">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">
            Dismiss
          </button>
        </div>
      )}

      {showCreateForm && (
        <div className="mb-6 rounded-lg border border-border bg-card p-6">
          <h2 className="font-semibold mb-4">Create Schedule</h2>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium mb-1">Mapping</label>
              <select
                value={newSchedule.mappingId}
                onChange={(e) => setNewSchedule({ ...newSchedule, mappingId: e.target.value })}
                className="w-full px-3 py-2 rounded-md border border-border bg-background"
              >
                {mappings.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Sync Type</label>
              <select
                value={newSchedule.type}
                onChange={(e) =>
                  setNewSchedule({ ...newSchedule, type: e.target.value as 'full' | 'incremental' })
                }
                className="w-full px-3 py-2 rounded-md border border-border bg-background"
              >
                <option value="incremental">Incremental</option>
                <option value="full">Full</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Cron Pattern</label>
              <input
                type="text"
                value={newSchedule.cronPattern}
                onChange={(e) => setNewSchedule({ ...newSchedule, cronPattern: e.target.value })}
                className="w-full px-3 py-2 rounded-md border border-border bg-background font-mono text-sm"
                placeholder="0 */6 * * *"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Example: 0 */6 * * * (every 6 hours)
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Timezone</label>
              <input
                type="text"
                value={newSchedule.timezone}
                onChange={(e) => setNewSchedule({ ...newSchedule, timezone: e.target.value })}
                className="w-full px-3 py-2 rounded-md border border-border bg-background"
                placeholder="UTC"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={createSchedule}
              className="px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Create
            </button>
            <button
              onClick={() => setShowCreateForm(false)}
              className="px-4 py-2 text-sm font-medium rounded-md border border-border hover:bg-accent"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {schedules.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-lg font-medium mb-2">No schedules configured</p>
          <p className="text-muted-foreground mb-4">
            Create a schedule to automatically run syncs at regular intervals
          </p>
          <button
            onClick={() => setShowCreateForm(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Create Schedule
          </button>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium">Mapping</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Type</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Schedule</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Next Run</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Status</th>
                <th className="px-4 py-3 text-right text-sm font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {schedules.map((schedule) => (
                <tr key={schedule.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 text-sm">{schedule.mappingName}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className="capitalize">{schedule.type}</span>
                  </td>
                  <td className="px-4 py-3 text-sm font-mono">{schedule.cronPattern}</td>
                  <td className="px-4 py-3 text-sm">{formatNextRun(schedule.nextRun)}</td>
                  <td className="px-4 py-3 text-sm">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${
                        schedule.enabled
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {schedule.enabled ? 'Active' : 'Paused'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => toggleSchedule(schedule)}
                        className="p-1.5 rounded hover:bg-accent"
                        title={schedule.enabled ? 'Pause' : 'Resume'}
                      >
                        {schedule.enabled ? (
                          <Pause className="h-4 w-4" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                      </button>
                      <button
                        onClick={() => deleteSchedule(schedule.id)}
                        className="p-1.5 rounded hover:bg-accent text-red-600"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
