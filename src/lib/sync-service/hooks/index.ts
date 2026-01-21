/**
 * Built-in Hooks - Export and registration
 * ============================================================================
 * Central export for all built-in sync hooks.
 *
 * Usage:
 *   import { registerBuiltinHooks } from '@/lib/sync-service/hooks'
 *   registerBuiltinHooks(registry)
 *
 * Path: src/lib/sync-service/hooks/index.ts
 */

import { backupHook } from './backup-hook'
import { thumbnailHook } from './thumbnail-hook'
import { cleanupHook } from './cleanup-hook'
import type { HookRegistry } from '../services/hook-registry'

// Export individual hooks for direct use
export { backupHook } from './backup-hook'
export { thumbnailHook } from './thumbnail-hook'
export { cleanupHook } from './cleanup-hook'

/**
 * All built-in hooks in registration order.
 */
export const builtinHooks = [
  backupHook,
  thumbnailHook,
  cleanupHook,
]

/**
 * Register all built-in hooks with a registry.
 */
export function registerBuiltinHooks(registry: HookRegistry): void {
  for (const hook of builtinHooks) {
    registry.register(hook)
  }
}

/**
 * Check if built-in hooks are registered in a registry.
 */
export function areBuiltinHooksRegistered(registry: HookRegistry): boolean {
  return builtinHooks.every(hook => registry.getHook(hook.id) !== undefined)
}
