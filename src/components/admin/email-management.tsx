'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { EmailSettingsTab } from './email-settings-tab'
import { EmailLogsTab } from './email-logs-tab'
import type { EmailSettingsRecord } from '@/lib/types/settings'
import type { EmailLogEntry, EmailLogStats } from '@/lib/data/queries/email-logs'

// ============================================================================
// Types
// ============================================================================

interface EmailManagementProps {
  emailSettings: EmailSettingsRecord
  initialLogs: EmailLogEntry[]
  initialStats: EmailLogStats
}

type TabId = 'settings' | 'logs'

// ============================================================================
// Component
// ============================================================================

export function EmailManagement({
  emailSettings,
  initialLogs,
  initialStats,
}: EmailManagementProps) {
  const [activeTab, setActiveTab] = React.useState<TabId>('settings')

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="flex gap-1 border-b border-border">
        <button
          type="button"
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
            activeTab === 'settings'
              ? 'border-foreground text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
          onClick={() => setActiveTab('settings')}
        >
          Settings
        </button>
        <button
          type="button"
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
            activeTab === 'logs'
              ? 'border-foreground text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
          onClick={() => setActiveTab('logs')}
        >
          Logs
          {initialStats.totalFailed > 0 && (
            <span className="ml-2 inline-flex items-center justify-center px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-800">
              {initialStats.totalFailed} failed
            </span>
          )}
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'settings' && (
        <EmailSettingsTab emailSettings={emailSettings} />
      )}

      {activeTab === 'logs' && (
        <EmailLogsTab initialLogs={initialLogs} initialStats={initialStats} />
      )}
    </div>
  )
}
