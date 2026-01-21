/**
 * Sync Types - Sync engine interfaces and result types
 */

// ============================================================================
// Sync Result Types
// ============================================================================

export interface SyncStats {
  fetched: number;
  filtered: number;
  inserted: number;
  updated: number;
  deleted: number;
  skipped: number;
  failed: number;
}

export interface SyncDuration {
  fetchMs: number;
  transformMs: number;
  writeMs: number;
  totalMs: number;
}

export interface SyncResult {
  success: boolean;
  mappingId: string;
  mappingName?: string;
  type: 'full' | 'incremental' | 'webhook';
  dryRun: boolean;
  stats: SyncStats;
  duration: SyncDuration;
  errors: string[];
  startedAt: string;
  completedAt: string;
  historyId?: string;  // ID of the SyncRun record in database
}

// ============================================================================
// Sync Progress Types
// ============================================================================

export type SyncPhase =
  | 'initializing'
  | 'starting'
  | 'fetching'
  | 'transforming'
  | 'writing'
  | 'cleaning'
  | 'cleanup'
  | 'completed'
  | 'failed';

export interface SyncProgress {
  phase: SyncPhase;
  recordsFetched: number;
  recordsTransformed: number;
  recordsWritten: number;
  recordsSkipped: number;
  errors: number;                // Count of errors/failed records (details are in SyncResult.errors)
  currentBatch?: number;
  totalBatches?: number;
  elapsedMs: number;
  estimatedRemainingMs?: number;
  message?: string;              // Optional status message
}

export type ProgressCallback = (progress: SyncProgress) => void;

// ============================================================================
// Sync Options Types
// ============================================================================

export interface FullSyncOptions {
  mappingId: string;
  dryRun?: boolean;
  deleteStale?: boolean;
  onProgress?: ProgressCallback;
}

export interface IncrementalSyncOptions {
  mappingId: string;
  dryRun?: boolean;
  lookbackMinutes?: number;
  since?: Date;
  onProgress?: ProgressCallback;
}

// ============================================================================
// Sync History Types
// ============================================================================

export type SyncStatus = 'running' | 'completed' | 'failed' | 'cancelled' | 'skipped';

export interface SyncHistoryEntry {
  id: string;
  mappingId: string;
  mappingName?: string;
  type: 'full' | 'incremental' | 'webhook';
  status: SyncStatus;
  triggeredBy?: string;  // 'manual', 'schedule', 'webhook', 'api'
  dryRun: boolean;
  stats: SyncStats;
  duration?: SyncDuration;
  errors: string[];
  startedAt: string;
  completedAt?: string;
}

export interface SyncHistoryList {
  entries: SyncHistoryEntry[];
  total: number;
  hasMore: boolean;
}

// ============================================================================
// Running Sync State
// ============================================================================

export interface RunningSyncInfo {
  id: string;
  mappingId: string;
  type: 'full' | 'incremental' | 'webhook';
  startedAt: string;
  progress: SyncProgress;
}
