/**
 * Cleanup Hook - Removes old backups based on retention policy
 * ============================================================================
 * Runs in post-sync phase to clean up old backup sets.
 * Uses the existing cleanupOldBackups function from sync.ts.
 *
 * Path: src/lib/sync-service/hooks/cleanup-hook.ts
 */

import type { SyncHook, HookContext } from '../types/hooks'
import { BUILTIN_HOOKS } from '../types/hooks'
import { getSyncSettings } from '@/lib/data/queries/settings'
import { cleanupOldBackups } from '@/lib/shopify/sync'

/**
 * Post-sync hook that cleans up old backups.
 */
export const cleanupHook: SyncHook = {
  id: BUILTIN_HOOKS.CLEANUP,
  phase: 'post-sync',
  priority: 20, // Run after thumbnails in post-sync phase
  name: 'Cleanup',
  description: 'Removes old backups based on retention policy',
  enabled: true,

  // Only run for full syncs
  onlyForSyncTypes: ['full'],

  async handler(context: HookContext): Promise<void> {
    const { logger, dryRun } = context

    // Check if cleanup is enabled in settings
    const settings = await getSyncSettings()
    if (!settings.cleanupStaleBackups) {
      logger.info('Backup cleanup disabled in settings, skipping')
      return
    }

    if (dryRun) {
      logger.info('Dry run mode - skipping backup cleanup')
      return
    }

    logger.info(`Cleaning up backups older than ${settings.backupRetentionDays} days...`)

    const result = await cleanupOldBackups(settings.backupRetentionDays)

    if (result.errors.length > 0) {
      logger.warn(`Cleanup completed with ${result.errors.length} errors`)
      result.errors.forEach(err => logger.error(err))
    }

    logger.info(
      `Cleanup complete: ${result.deletedCount} deleted, ${result.keptCount} kept`
    )
  },
}

export default cleanupHook
