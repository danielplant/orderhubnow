/**
 * Backup Hook - Creates pre-sync backup of target table
 * ============================================================================
 * Runs in pre-sync phase to create a backup before data is modified.
 * Uses the existing backupSkuTable function from sync.ts.
 *
 * Path: src/lib/sync-service/hooks/backup-hook.ts
 */

import type { SyncHook, HookContext } from '../types/hooks'
import { BUILTIN_HOOKS } from '../types/hooks'
import { getSyncSettings } from '@/lib/data/queries/settings'
import { backupSkuTable } from '@/lib/shopify/sync'

/**
 * Pre-sync hook that creates a backup of the Sku table.
 */
export const backupHook: SyncHook = {
  id: BUILTIN_HOOKS.BACKUP,
  phase: 'pre-sync',
  priority: 10, // Run first in pre-sync phase
  name: 'Backup',
  description: 'Creates a backup of the Sku table before sync',
  enabled: true,

  // Only run for full syncs (not webhooks/incremental)
  onlyForSyncTypes: ['full'],

  async handler(context: HookContext): Promise<void> {
    const { logger, dryRun } = context

    // Check if backups are enabled in settings
    const settings = await getSyncSettings()
    if (!settings.backupEnabled) {
      logger.info('Backups disabled in settings, skipping')
      return
    }

    if (dryRun) {
      logger.info('Dry run mode - skipping backup')
      return
    }

    logger.info('Creating pre-sync backup...')
    const backupSetId = await backupSkuTable()

    if (backupSetId === null) {
      logger.info('No data to backup (table empty)')
    } else {
      logger.info(`Backup created: BackupSet ID ${backupSetId}`)
    }
  },
}

export default backupHook
