/**
 * Hook Types - Pre/post sync hook definitions
 * ============================================================================
 * Hooks allow custom code to run at specific points during the sync process.
 * Examples: backups before sync, thumbnail generation after sync.
 *
 * Path: src/lib/sync-service/types/hooks.ts
 */

import type { MappingConfig } from './mapping'

// ============================================================================
// Hook Phases - When hooks run in the sync lifecycle
// ============================================================================

export type HookPhase =
  | 'pre-sync'        // Before sync starts (e.g., create backups)
  | 'post-fetch'      // After data fetched from Shopify, before transform
  | 'post-transform'  // After transform, before database write
  | 'post-write'      // After database write, before sync completion
  | 'post-sync'       // After sync completes (e.g., generate thumbnails)

// ============================================================================
// Hook Context - Data passed to hook handlers
// ============================================================================

export interface HookLogger {
  info: (msg: string) => void
  warn: (msg: string) => void
  error: (msg: string) => void
}

export interface HookContext {
  // Sync identification
  mappingId: string
  mappingConfig: MappingConfig
  syncType: 'full' | 'incremental' | 'webhook'
  dryRun: boolean
  runId: string

  // Logger for consistent output
  logger: HookLogger

  // Phase-specific data (populated by engine before calling hooks)
  records?: HookShopifyRecord[]                // Available in post-fetch
  transformedRows?: Record<string, unknown>[]  // Available in post-transform
  stats?: HookSyncStats                        // Available in post-write, post-sync
  errors?: string[]                            // Accumulated errors

  // User context
  userId?: string
}

export interface HookShopifyRecord {
  id: string
  [key: string]: unknown
}

export interface HookSyncStats {
  fetched: number
  inserted: number
  updated: number
  skipped: number
  failed: number
}

// ============================================================================
// Hook Definition - Registered hook configuration
// ============================================================================

export interface SyncHook {
  id: string
  phase: HookPhase
  priority: number     // Lower runs first (10, 20, 30...). Use multiples of 10 for insertion room.
  name: string
  description?: string
  handler: (context: HookContext) => Promise<void>
  enabled: boolean

  // Optional conditions
  onlyForMappings?: string[]  // Only run for specific mapping IDs
  onlyForSyncTypes?: Array<'full' | 'incremental' | 'webhook'>
}

// ============================================================================
// Hook Result - Execution outcome
// ============================================================================

export interface HookResult {
  hookId: string
  hookName: string
  phase: HookPhase
  success: boolean
  durationMs: number
  error?: string
  metadata?: Record<string, unknown>  // Hook-specific data (e.g., thumbnail count)
}

// ============================================================================
// Built-in Hook IDs - Reserved identifiers for system hooks
// ============================================================================

export const BUILTIN_HOOKS = {
  BACKUP: 'builtin:backup',
  THUMBNAIL: 'builtin:thumbnail',
  CLEANUP: 'builtin:cleanup',
} as const

// ============================================================================
// Helper Functions
// ============================================================================

export function createHook(
  config: Omit<SyncHook, 'enabled'> & { enabled?: boolean }
): SyncHook {
  return {
    ...config,
    enabled: config.enabled ?? true,
  }
}

export function createHookLogger(prefix: string): HookLogger {
  return {
    info: (msg: string) => console.log(`[${prefix}] ${msg}`),
    warn: (msg: string) => console.warn(`[${prefix}] ${msg}`),
    error: (msg: string) => console.error(`[${prefix}] ${msg}`),
  }
}
