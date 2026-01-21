/**
 * Sync Engine - Main orchestrator for sync operations
 *
 * Features:
 * - Full sync via Shopify bulk operations
 * - Incremental sync via paginated queries
 * - AbortController for cancellation
 * - Concurrent sync protection (one per mapping)
 * - Filter evaluation before transform
 * - Progress callbacks and history logging
 */

import type { MappingConfig, MappingFilter } from '../types/mapping';
import type { SyncProgress, SyncResult, SyncStats } from '../types/sync';
import type { DatabaseConnector } from '../types/database';
import type { ShopifyConnector } from '../connectors/shopify';
import type { HookContext, HookPhase, HookResult } from '../types/hooks';
import { ShopifyFetcher, type BulkOperationOptions } from './shopify-fetcher';
import { DatabaseWriter } from './database-writer';
import { TransformEngine, type ShopifyRecord } from './transform-engine';
import { getSyncHistoryService } from './sync-history';
import { getMappingService } from './mapping-service';
import { HookRegistry, getHookRegistry } from './hook-registry';

// ============================================================================
// Types
// ============================================================================

export interface SyncOptions {
  mappingId: string;
  dryRun: boolean;
  onProgress?: (progress: SyncProgress) => void;
}

export interface IncrementalSyncOptions extends SyncOptions {
  since?: Date;
  lookbackMinutes?: number;
}

export interface FullSyncOptions extends SyncOptions {
  bulkOperationTimeout?: number; // Default 10 minutes
  deleteStale?: boolean; // Delete records not in source
}

interface RunningSync {
  mappingId: string;
  type: 'full' | 'incremental';
  startedAt: Date;
  historyId: string;
  abortController: AbortController;
}

// ============================================================================
// SyncEngine Class
// ============================================================================

export class SyncEngine {
  private shopifyFetcher: ShopifyFetcher;
  private dbWriter: DatabaseWriter;
  private transformEngine: TransformEngine;
  private historyService = getSyncHistoryService();
  private mappingService = getMappingService();
  private hookRegistry: HookRegistry;

  private runningSyncs = new Map<string, RunningSync>();

  constructor(
    shopifyConnector: ShopifyConnector,
    dbConnector: DatabaseConnector,
    hookRegistry?: HookRegistry
  ) {
    this.shopifyFetcher = new ShopifyFetcher(shopifyConnector);
    this.dbWriter = new DatabaseWriter(dbConnector);
    this.transformEngine = new TransformEngine(dbConnector);
    this.hookRegistry = hookRegistry ?? getHookRegistry();
  }

  /**
   * Run hooks for a given phase.
   * Returns hook results for logging/debugging.
   */
  private async runHooks(
    phase: HookPhase,
    context: Omit<HookContext, 'logger'>
  ): Promise<HookResult[]> {
    return this.hookRegistry.run(phase, context as HookContext);
  }

  /**
   * Create a base hook context for a sync operation.
   */
  private createHookContext(
    mapping: MappingConfig,
    syncType: 'full' | 'incremental' | 'webhook',
    runId: string,
    dryRun: boolean
  ): Omit<HookContext, 'logger' | 'records' | 'transformedRows' | 'stats' | 'errors'> {
    return {
      mappingId: mapping.id,
      mappingConfig: mapping,
      syncType,
      dryRun,
      runId,
    };
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Run a full sync using Shopify bulk operations.
   */
  async fullSync(options: FullSyncOptions): Promise<SyncResult> {
    const { mappingId, dryRun, onProgress } = options;
    const bulkTimeout = options.bulkOperationTimeout ?? 10 * 60 * 1000;

    // Check for existing sync
    if (this.runningSyncs.has(mappingId)) {
      throw new Error(`Sync already running for mapping ${mappingId}`);
    }

    // Load mapping config
    const mapping = await this.mappingService.getById(mappingId);
    if (!mapping) {
      throw new Error(`Mapping not found: ${mappingId}`);
    }

    // Setup
    const startTime = Date.now();
    const abortController = new AbortController();
    const stats = this.createEmptyStats();
    const errors: string[] = [];
    const timing = { fetchMs: 0, transformMs: 0, writeMs: 0 };

    // Create history entry
    const historyId = await this.historyService.create({
      mappingId,
      mappingName: mapping.name,
      type: 'full',
      status: 'running',
      startedAt: new Date().toISOString(),
      dryRun,
      stats: { ...stats, filtered: 0, deleted: 0 },
      errors: [],
    });

    // Track running sync
    this.runningSyncs.set(mappingId, {
      mappingId,
      type: 'full',
      startedAt: new Date(),
      historyId,
      abortController,
    });

    this.emitProgress(onProgress, {
      phase: 'starting',
      recordsFetched: 0,
      recordsTransformed: 0,
      recordsWritten: 0,
      recordsSkipped: 0,
      errors: 0,
      elapsedMs: 0,
      message: 'Starting full sync...',
    });

    try {
      // Create hook context for this sync
      const baseHookContext = this.createHookContext(mapping, 'full', historyId, dryRun);

      // Run pre-sync hooks (e.g., backup)
      await this.runHooks('pre-sync', baseHookContext);

      // Build bulk query
      const fields = this.getRequiredFields(mapping);
      const bulkQuery = this.shopifyFetcher.buildBulkQueryFromMapping(
        mapping.sourceResource,
        fields
      );

      // Fetch phase
      this.emitProgress(onProgress, {
        phase: 'fetching',
        recordsFetched: 0,
        recordsTransformed: 0,
        recordsWritten: 0,
        recordsSkipped: 0,
        errors: 0,
        elapsedMs: Date.now() - startTime,
        message: 'Submitting bulk query to Shopify...',
      });

      const fetchStart = Date.now();
      const records: ShopifyRecord[] = [];
      const validKeys = new Set<string>();

      const bulkOptions: BulkOperationOptions = {
        timeoutMs: bulkTimeout,
      };

      for await (const record of this.shopifyFetcher.runBulkQuery(
        bulkQuery,
        bulkOptions,
        abortController.signal
      )) {
        if (abortController.signal.aborted) {
          throw new Error('Sync cancelled');
        }

        stats.fetched++;
        records.push(record);

        // Emit progress every 100 records
        if (stats.fetched % 100 === 0) {
          this.emitProgress(onProgress, {
            phase: 'fetching',
            recordsFetched: stats.fetched,
            recordsTransformed: 0,
            recordsWritten: 0,
            recordsSkipped: stats.skipped,
            errors: stats.failed,
            elapsedMs: Date.now() - startTime,
            message: `Fetched ${stats.fetched} records...`,
          });
        }
      }

      timing.fetchMs = Date.now() - fetchStart;

      // Run post-fetch hooks
      await this.runHooks('post-fetch', {
        ...baseHookContext,
        records: records.map(r => ({ ...r, id: String(r.id || '') })),
      });

      // Filter records first
      const filteredRecords: ShopifyRecord[] = [];
      for (const record of records) {
        if (this.passesFilters(record, mapping.filters)) {
          filteredRecords.push(record);
        } else {
          stats.skipped++;
        }
      }

      // Transform phase
      this.emitProgress(onProgress, {
        phase: 'transforming',
        recordsFetched: stats.fetched,
        recordsTransformed: 0,
        recordsWritten: 0,
        recordsSkipped: stats.skipped,
        errors: stats.failed,
        elapsedMs: Date.now() - startTime,
        message: `Transforming ${filteredRecords.length} records...`,
      });

      const transformStart = Date.now();
      const rowsToWrite: Record<string, unknown>[] = [];

      // Use batch transform which handles lookup cache and expression compilation
      const batchResult = await this.transformEngine.transformBatch(
        mapping,
        filteredRecords,
        { dryRun }
      );

      let transformed = 0;
      for (const result of batchResult.results) {
        transformed++;

        if (result.status !== 'error') {
          rowsToWrite.push(result.targetRow);

          // Track valid keys for stale cleanup
          if (mapping.keyMapping) {
            const keyValue = result.targetRow[mapping.keyMapping.targetColumn];
            if (keyValue != null) {
              validKeys.add(String(keyValue));
            }
          }
        } else {
          stats.failed++;
          for (const err of result.errors) {
            errors.push(`${result.sourceId}: ${err.message}`);
          }
        }
      }

      timing.transformMs = Date.now() - transformStart;

      // Run post-transform hooks
      await this.runHooks('post-transform', {
        ...baseHookContext,
        transformedRows: rowsToWrite,
      });

      // Write phase
      if (!dryRun && rowsToWrite.length > 0 && mapping.keyMapping) {
        this.emitProgress(onProgress, {
          phase: 'writing',
          recordsFetched: stats.fetched,
          recordsTransformed: transformed,
          recordsWritten: 0,
          recordsSkipped: stats.skipped,
          errors: stats.failed,
          elapsedMs: Date.now() - startTime,
          message: `Writing ${rowsToWrite.length} records to database...`,
        });

        const writeStart = Date.now();

        const writeResult = await this.dbWriter.upsert({
          table: mapping.targetTable,
          keyColumn: mapping.keyMapping.targetColumn,
          rows: rowsToWrite,
          onConflict: 'update',
        });

        stats.inserted = writeResult.inserted;
        stats.updated = writeResult.updated;
        stats.failed += writeResult.errors.length;

        for (const err of writeResult.errors) {
          errors.push(`Row ${err.row}: ${err.error}`);
        }

        timing.writeMs = Date.now() - writeStart;

        // Run post-write hooks
        await this.runHooks('post-write', {
          ...baseHookContext,
          stats: {
            fetched: stats.fetched,
            inserted: stats.inserted,
            updated: stats.updated,
            skipped: stats.skipped,
            failed: stats.failed,
          },
        });

        // Optional: delete stale records
        if (options.deleteStale && validKeys.size > 0) {
          this.emitProgress(onProgress, {
            phase: 'cleanup',
            recordsFetched: stats.fetched,
            recordsTransformed: transformed,
            recordsWritten: stats.inserted + stats.updated,
            recordsSkipped: stats.skipped,
            errors: stats.failed,
            elapsedMs: Date.now() - startTime,
            message: 'Cleaning up stale records...',
          });

          await this.dbWriter.deleteStale(
            mapping.targetTable,
            mapping.keyMapping.targetColumn,
            validKeys
          );
        }
      }

      // Success
      const totalMs = Date.now() - startTime;

      await this.historyService.update(historyId, {
        status: 'completed',
        completedAt: new Date().toISOString(),
        stats: { ...stats, filtered: 0, deleted: 0 },
        duration: { totalMs, ...timing },
        errors: errors.slice(0, 50),
      });

      this.emitProgress(onProgress, {
        phase: 'completed',
        recordsFetched: stats.fetched,
        recordsTransformed: transformed,
        recordsWritten: stats.inserted + stats.updated,
        recordsSkipped: stats.skipped,
        errors: stats.failed,
        elapsedMs: totalMs,
        message: 'Full sync completed successfully',
      });

      // Run post-sync hooks (e.g., thumbnails, cleanup)
      await this.runHooks('post-sync', {
        ...baseHookContext,
        stats: {
          fetched: stats.fetched,
          inserted: stats.inserted,
          updated: stats.updated,
          skipped: stats.skipped,
          failed: stats.failed,
        },
        errors,
      });

      return {
        success: true,
        mappingId,
        historyId,
        type: 'full',
        dryRun,
        stats: { ...stats, filtered: 0, deleted: 0 },
        duration: { totalMs, ...timing },
        errors,
        startedAt: new Date(startTime).toISOString(),
        completedAt: new Date().toISOString(),
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const totalMs = Date.now() - startTime;
      const isCancelled = errorMessage.includes('cancelled');

      await this.historyService.update(historyId, {
        status: isCancelled ? 'cancelled' : 'failed',
        completedAt: new Date().toISOString(),
        stats: { ...stats, filtered: 0, deleted: 0 },
        duration: { totalMs, ...timing },
        errors: [...errors, errorMessage].slice(0, 50),
      });

      this.emitProgress(onProgress, {
        phase: 'failed',
        recordsFetched: stats.fetched,
        recordsTransformed: 0,
        recordsWritten: 0,
        recordsSkipped: stats.skipped,
        errors: stats.failed,
        elapsedMs: totalMs,
        message: errorMessage,
      });

      return {
        success: false,
        mappingId,
        historyId,
        type: 'full',
        dryRun,
        stats: { ...stats, filtered: 0, deleted: 0 },
        duration: { totalMs, ...timing },
        errors: [...errors, errorMessage],
        startedAt: new Date(startTime).toISOString(),
        completedAt: new Date().toISOString(),
      };
    } finally {
      this.runningSyncs.delete(mappingId);
    }
  }

  /**
   * Run an incremental sync using paginated queries.
   */
  async incrementalSync(options: IncrementalSyncOptions): Promise<SyncResult> {
    const { mappingId, dryRun, onProgress } = options;
    const lookbackMinutes = options.lookbackMinutes ?? 15;

    // Check for existing sync
    if (this.runningSyncs.has(mappingId)) {
      throw new Error(`Sync already running for mapping ${mappingId}`);
    }

    // Load mapping config
    const mapping = await this.mappingService.getById(mappingId);
    if (!mapping) {
      throw new Error(`Mapping not found: ${mappingId}`);
    }

    // Determine since timestamp
    const since =
      options.since ?? new Date(Date.now() - lookbackMinutes * 60 * 1000);

    // Setup
    const startTime = Date.now();
    const abortController = new AbortController();
    const stats = this.createEmptyStats();
    const errors: string[] = [];
    const timing = { fetchMs: 0, transformMs: 0, writeMs: 0 };

    // Create history entry
    const historyId = await this.historyService.create({
      mappingId,
      mappingName: mapping.name,
      type: 'incremental',
      status: 'running',
      startedAt: new Date().toISOString(),
      dryRun,
      stats: { ...stats, filtered: 0, deleted: 0 },
      errors: [],
    });

    // Track running sync
    this.runningSyncs.set(mappingId, {
      mappingId,
      type: 'incremental',
      startedAt: new Date(),
      historyId,
      abortController,
    });

    this.emitProgress(onProgress, {
      phase: 'starting',
      recordsFetched: 0,
      recordsTransformed: 0,
      recordsWritten: 0,
      recordsSkipped: 0,
      errors: 0,
      elapsedMs: 0,
      message: `Starting incremental sync since ${since.toISOString()}...`,
    });

    try {
      // Create hook context for this sync
      const baseHookContext = this.createHookContext(mapping, 'incremental', historyId, dryRun);

      // Run pre-sync hooks
      await this.runHooks('pre-sync', baseHookContext);

      const fields = this.getRequiredFields(mapping);
      const fetchStart = Date.now();

      // Fetch records
      const fetchedRecords: ShopifyRecord[] = [];

      for await (const record of this.shopifyFetcher.fetchIncremental({
        resource: mapping.sourceResource,
        fields,
        updatedAfter: since,
        signal: abortController.signal,
      })) {
        if (abortController.signal.aborted) {
          throw new Error('Sync cancelled');
        }

        stats.fetched++;
        fetchedRecords.push(record);

        // Emit progress every 50 records
        if (stats.fetched % 50 === 0) {
          this.emitProgress(onProgress, {
            phase: 'fetching',
            recordsFetched: stats.fetched,
            recordsTransformed: 0,
            recordsWritten: 0,
            recordsSkipped: stats.skipped,
            errors: stats.failed,
            elapsedMs: Date.now() - startTime,
            message: `Fetched ${stats.fetched} records...`,
          });
        }
      }

      timing.fetchMs = Date.now() - fetchStart;

      // Run post-fetch hooks
      await this.runHooks('post-fetch', {
        ...baseHookContext,
        records: fetchedRecords.map(r => ({ ...r, id: String(r.id || '') })),
      });

      // Filter records
      const filteredRecords: ShopifyRecord[] = [];
      for (const record of fetchedRecords) {
        if (this.passesFilters(record, mapping.filters)) {
          filteredRecords.push(record);
        } else {
          stats.skipped++;
        }
      }

      // Transform phase
      this.emitProgress(onProgress, {
        phase: 'transforming',
        recordsFetched: stats.fetched,
        recordsTransformed: 0,
        recordsWritten: 0,
        recordsSkipped: stats.skipped,
        errors: stats.failed,
        elapsedMs: Date.now() - startTime,
        message: `Transforming ${filteredRecords.length} records...`,
      });

      const transformStart = Date.now();
      const rowsToWrite: Record<string, unknown>[] = [];

      const batchResult = await this.transformEngine.transformBatch(
        mapping,
        filteredRecords,
        { dryRun }
      );

      let transformed = 0;
      for (const result of batchResult.results) {
        transformed++;

        if (result.status !== 'error') {
          rowsToWrite.push(result.targetRow);
        } else {
          stats.failed++;
          for (const err of result.errors) {
            errors.push(`${result.sourceId}: ${err.message}`);
          }
        }
      }

      timing.transformMs = Date.now() - transformStart;

      // Run post-transform hooks
      await this.runHooks('post-transform', {
        ...baseHookContext,
        transformedRows: rowsToWrite,
      });

      // Write phase
      if (!dryRun && rowsToWrite.length > 0 && mapping.keyMapping) {
        this.emitProgress(onProgress, {
          phase: 'writing',
          recordsFetched: stats.fetched,
          recordsTransformed: transformed,
          recordsWritten: 0,
          recordsSkipped: stats.skipped,
          errors: stats.failed,
          elapsedMs: Date.now() - startTime,
          message: `Writing ${rowsToWrite.length} records to database...`,
        });

        const writeStart = Date.now();

        const writeResult = await this.dbWriter.upsert({
          table: mapping.targetTable,
          keyColumn: mapping.keyMapping.targetColumn,
          rows: rowsToWrite,
          onConflict: 'update',
        });

        stats.inserted = writeResult.inserted;
        stats.updated = writeResult.updated;
        stats.failed += writeResult.errors.length;

        for (const err of writeResult.errors) {
          errors.push(`Row ${err.row}: ${err.error}`);
        }

        timing.writeMs = Date.now() - writeStart;

        // Run post-write hooks
        await this.runHooks('post-write', {
          ...baseHookContext,
          stats: {
            fetched: stats.fetched,
            inserted: stats.inserted,
            updated: stats.updated,
            skipped: stats.skipped,
            failed: stats.failed,
          },
        });
      }

      // Success
      const totalMs = Date.now() - startTime;

      await this.historyService.update(historyId, {
        status: 'completed',
        completedAt: new Date().toISOString(),
        stats: { ...stats, filtered: 0, deleted: 0 },
        duration: { totalMs, ...timing },
        errors: errors.slice(0, 50),
      });

      this.emitProgress(onProgress, {
        phase: 'completed',
        recordsFetched: stats.fetched,
        recordsTransformed: transformed,
        recordsWritten: stats.inserted + stats.updated,
        recordsSkipped: stats.skipped,
        errors: stats.failed,
        elapsedMs: totalMs,
        message: `Incremental sync completed: ${transformed} records processed`,
      });

      // Run post-sync hooks (e.g., thumbnails, cleanup)
      await this.runHooks('post-sync', {
        ...baseHookContext,
        stats: {
          fetched: stats.fetched,
          inserted: stats.inserted,
          updated: stats.updated,
          skipped: stats.skipped,
          failed: stats.failed,
        },
        errors,
      });

      return {
        success: true,
        mappingId,
        historyId,
        type: 'incremental',
        dryRun,
        stats: { ...stats, filtered: 0, deleted: 0 },
        duration: { totalMs, ...timing },
        errors,
        startedAt: new Date(startTime).toISOString(),
        completedAt: new Date().toISOString(),
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const totalMs = Date.now() - startTime;
      const isCancelled = errorMessage.includes('cancelled');

      await this.historyService.update(historyId, {
        status: isCancelled ? 'cancelled' : 'failed',
        completedAt: new Date().toISOString(),
        stats: { ...stats, filtered: 0, deleted: 0 },
        duration: { totalMs, ...timing },
        errors: [...errors, errorMessage].slice(0, 50),
      });

      return {
        success: false,
        mappingId,
        historyId,
        type: 'incremental',
        dryRun,
        stats: { ...stats, filtered: 0, deleted: 0 },
        duration: { totalMs, ...timing },
        errors: [...errors, errorMessage],
        startedAt: new Date(startTime).toISOString(),
        completedAt: new Date().toISOString(),
      };
    } finally {
      this.runningSyncs.delete(mappingId);
    }
  }

  /**
   * Cancel a running sync.
   */
  cancel(mappingId: string, reason?: string): boolean {
    const running = this.runningSyncs.get(mappingId);
    if (!running) {
      return false;
    }

    running.abortController.abort(reason ?? 'Cancelled by user');
    return true;
  }

  /**
   * Get info about a running sync.
   */
  getRunningSync(
    mappingId: string
  ): Omit<RunningSync, 'abortController'> | null {
    const running = this.runningSyncs.get(mappingId);
    if (!running) {
      return null;
    }

    return {
      mappingId: running.mappingId,
      type: running.type,
      startedAt: running.startedAt,
      historyId: running.historyId,
    };
  }

  /**
   * List all running syncs.
   */
  listRunningSyncs(): Array<Omit<RunningSync, 'abortController'>> {
    return Array.from(this.runningSyncs.values()).map((r) => ({
      mappingId: r.mappingId,
      type: r.type,
      startedAt: r.startedAt,
      historyId: r.historyId,
    }));
  }

  // ==========================================================================
  // Filter Evaluation
  // ==========================================================================

  /**
   * Check if a record passes all filters.
   */
  private passesFilters(
    record: ShopifyRecord,
    filters?: MappingFilter[]
  ): boolean {
    if (!filters || filters.length === 0) {
      return true;
    }

    for (const filter of filters) {
      if (!this.evaluateFilter(record, filter)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Evaluate a single filter against a record.
   */
  private evaluateFilter(
    record: ShopifyRecord,
    filter: MappingFilter
  ): boolean {
    const value = this.getNestedValue(record, filter.field);

    switch (filter.operator) {
      case 'eq':
        return value === filter.value;

      case 'neq':
        return value !== filter.value;

      case 'in':
        return Array.isArray(filter.value) && filter.value.includes(value);

      case 'not_in':
        return Array.isArray(filter.value) && !filter.value.includes(value);

      case 'exists':
        return value != null;

      case 'not_exists':
        return value == null;

      case 'gt':
        return (
          typeof value === 'number' &&
          typeof filter.value === 'number' &&
          value > filter.value
        );

      case 'lt':
        return (
          typeof value === 'number' &&
          typeof filter.value === 'number' &&
          value < filter.value
        );

      case 'gte':
        return (
          typeof value === 'number' &&
          typeof filter.value === 'number' &&
          value >= filter.value
        );

      case 'lte':
        return (
          typeof value === 'number' &&
          typeof filter.value === 'number' &&
          value <= filter.value
        );

      case 'contains':
        return (
          typeof value === 'string' &&
          typeof filter.value === 'string' &&
          value.includes(filter.value)
        );

      case 'starts_with':
        return (
          typeof value === 'string' &&
          typeof filter.value === 'string' &&
          value.startsWith(filter.value)
        );

      case 'regex':
        if (typeof value !== 'string' || typeof filter.value !== 'string') {
          return false;
        }
        try {
          return new RegExp(filter.value).test(value);
        } catch {
          return false;
        }

      default:
        return true;
    }
  }

  /**
   * Get a nested value from an object using dot notation.
   */
  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
      if (current == null || typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  /**
   * Extract all required fields from a mapping config.
   */
  private getRequiredFields(mapping: MappingConfig): string[] {
    const fields = new Set<string>();

    // Key field
    if (mapping.keyMapping) {
      fields.add(mapping.keyMapping.sourceField);
    }

    // All mapped fields
    for (const fieldMapping of mapping.mappings) {
      if (!fieldMapping.enabled) continue;

      if (fieldMapping.source.type === 'single') {
        fields.add(fieldMapping.source.field);
      } else {
        for (const src of fieldMapping.source.fields) {
          fields.add(src.field);
        }
      }
    }

    // Filter fields
    if (mapping.filters) {
      for (const filter of mapping.filters) {
        fields.add(filter.field);
      }
    }

    return Array.from(fields);
  }

  private createEmptyStats(): Omit<SyncStats, 'filtered' | 'deleted'> {
    return {
      fetched: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
    };
  }

  private emitProgress(
    callback: ((progress: SyncProgress) => void) | undefined,
    progress: SyncProgress
  ): void {
    if (callback) {
      try {
        callback(progress);
      } catch (err) {
        console.error('[SyncEngine] Progress callback error:', err);
      }
    }
  }
}
