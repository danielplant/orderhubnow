/**
 * Feature Flags
 * ============================================================================
 * Runtime feature flags for gradual rollout and instant rollback.
 *
 * Usage:
 *   import { SYNC_ENGINE_V2 } from '@/lib/feature-flags'
 *   if (SYNC_ENGINE_V2) { newPath() } else { legacyPath() }
 *
 * To enable: Set SYNC_ENGINE_V2=true in environment variables
 * To rollback: Set SYNC_ENGINE_V2=false (no deployment required)
 */

/**
 * When true, uses the new configurable SyncEngine with hooks.
 * When false, uses the legacy runFullSync from src/lib/shopify/sync.ts.
 *
 * Default: false (legacy behavior)
 */
export const SYNC_ENGINE_V2 = process.env.SYNC_ENGINE_V2 === 'true'
