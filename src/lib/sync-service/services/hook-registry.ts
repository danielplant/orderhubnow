/**
 * Hook Registry - Manages sync hooks with priority ordering
 * ============================================================================
 * Registers, manages, and executes hooks at specific sync lifecycle phases.
 *
 * Usage:
 *   const registry = new HookRegistry()
 *   registry.register(backupHook)
 *   registry.register(thumbnailHook)
 *   await registry.run('pre-sync', context)
 *
 * Path: src/lib/sync-service/services/hook-registry.ts
 */

import type {
  SyncHook,
  HookPhase,
  HookContext,
  HookResult,
  HookLogger,
} from '../types/hooks'

export class HookRegistry {
  private hooks: SyncHook[] = []

  /**
   * Register a hook. Hooks are automatically sorted by priority (lower first).
   */
  register(hook: SyncHook): void {
    // Check for duplicate ID
    const existing = this.hooks.find(h => h.id === hook.id)
    if (existing) {
      console.warn(`[HookRegistry] Replacing existing hook: ${hook.id}`)
      this.hooks = this.hooks.filter(h => h.id !== hook.id)
    }

    this.hooks.push(hook)
    // Keep sorted by priority (ascending)
    this.hooks.sort((a, b) => a.priority - b.priority)
  }

  /**
   * Unregister a hook by ID.
   */
  unregister(hookId: string): boolean {
    const initialLength = this.hooks.length
    this.hooks = this.hooks.filter(h => h.id !== hookId)
    return this.hooks.length < initialLength
  }

  /**
   * Enable or disable a hook.
   */
  setEnabled(hookId: string, enabled: boolean): boolean {
    const hook = this.hooks.find(h => h.id === hookId)
    if (hook) {
      hook.enabled = enabled
      return true
    }
    return false
  }

  /**
   * Get all registered hooks for a phase.
   */
  getHooksForPhase(phase: HookPhase): SyncHook[] {
    return this.hooks.filter(h => h.phase === phase && h.enabled)
  }

  /**
   * Get all registered hooks.
   */
  getAllHooks(): SyncHook[] {
    return [...this.hooks]
  }

  /**
   * Run all enabled hooks for a phase.
   * Hooks run sequentially in priority order.
   * Errors are caught and logged; execution continues to next hook.
   */
  async run(phase: HookPhase, context: HookContext): Promise<HookResult[]> {
    const phaseHooks = this.hooks.filter(h => {
      // Must be enabled
      if (!h.enabled) return false

      // Must match phase
      if (h.phase !== phase) return false

      // Check mapping filter
      if (h.onlyForMappings && !h.onlyForMappings.includes(context.mappingId)) {
        return false
      }

      // Check sync type filter
      if (h.onlyForSyncTypes && !h.onlyForSyncTypes.includes(context.syncType)) {
        return false
      }

      return true
    })

    const results: HookResult[] = []

    for (const hook of phaseHooks) {
      const start = Date.now()
      const logger = this.createHookLogger(hook.name)

      try {
        logger.info(`Starting...`)
        await hook.handler({ ...context, logger })
        const durationMs = Date.now() - start
        logger.info(`Completed in ${durationMs}ms`)

        results.push({
          hookId: hook.id,
          hookName: hook.name,
          phase,
          success: true,
          durationMs,
        })
      } catch (err) {
        const durationMs = Date.now() - start
        const errorMessage = err instanceof Error ? err.message : String(err)

        logger.error(`Failed after ${durationMs}ms: ${errorMessage}`)

        results.push({
          hookId: hook.id,
          hookName: hook.name,
          phase,
          success: false,
          durationMs,
          error: errorMessage,
        })

        // Continue to next hook - don't let one failure stop others
        console.error(`[Hook:${hook.name}] Failed:`, err)
      }
    }

    return results
  }

  /**
   * Create a logger for a specific hook.
   */
  private createHookLogger(hookName: string): HookLogger {
    const prefix = `Hook:${hookName}`
    return {
      info: (msg: string) => console.log(`[${prefix}] ${msg}`),
      warn: (msg: string) => console.warn(`[${prefix}] ${msg}`),
      error: (msg: string) => console.error(`[${prefix}] ${msg}`),
    }
  }

  /**
   * Clear all registered hooks.
   */
  clear(): void {
    this.hooks = []
  }

  /**
   * Get hook by ID.
   */
  getHook(hookId: string): SyncHook | undefined {
    return this.hooks.find(h => h.id === hookId)
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalRegistry: HookRegistry | null = null

/**
 * Get the global hook registry instance.
 * Creates one if it doesn't exist.
 */
export function getHookRegistry(): HookRegistry {
  if (!globalRegistry) {
    globalRegistry = new HookRegistry()
  }
  return globalRegistry
}

/**
 * Reset the global registry (useful for testing).
 */
export function resetHookRegistry(): void {
  globalRegistry = null
}
