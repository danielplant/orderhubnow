/**
 * Sync Service - Services Index
 *
 * Re-exports all service modules for convenient importing.
 */

// Configuration
export { ConfigService, getConfigService } from './config-service';
export type { SyncServiceConfig, DatabaseConfig, RedisConfig } from './config-service';

// Mapping Management
export { MappingService, getMappingService } from './mapping-service';

// Mapping Validation
export { MappingValidator, getMappingValidator } from './mapping-validator';
export type {
  ValidationResult,
  ValidationError,
  ValidationWarning,
} from './mapping-validator';

// Mapping Preview
export { MappingPreview, getMappingPreview } from './mapping-preview';
export type {
  PreviewResult,
  PreviewRow,
} from './mapping-preview';

// Sync History
export { SyncHistoryService, getSyncHistoryService } from './sync-history';

// Transform Engine (includes TypeCoercer, TemplateEngine, ExpressionEvaluator, LookupResolver)
export {
  TransformEngine,
  TypeCoercer,
  TemplateEngine,
  ExpressionEvaluator,
  LookupResolver,
} from './transform-engine';

export type {
  CoercionTarget,
  CoercionResult,
  TemplateResult,
  CompiledExpression,
  EvaluationResult,
  LookupRequirement,
  LookupCache,
  LookupTable,
  LookupStats,
  ShopifyRecord,
  TransformOptions,
  TransformResult,
  TransformError,
  TransformWarning,
  TransformMetrics,
  TransformContext,
  BatchResult,
} from './transform-engine';

// Sync Engine (core orchestrator)
export { SyncEngine } from './sync-engine';
export type { SyncOptions } from './sync-engine';
// Note: FullSyncOptions and IncrementalSyncOptions are exported from types/sync.ts

// Database Writer
export { DatabaseWriter } from './database-writer';
export type {
  UpsertOptions,
  WriteResult,
  BatchInsertOptions,
} from './database-writer';

// Shopify Fetcher
export { ShopifyFetcher } from './shopify-fetcher';
export type {
  BulkOperationOptions,
  IncrementalFetchOptions,
  BulkOperationResult,
} from './shopify-fetcher';
// Note: ShopifyRecord is exported from transform-engine to avoid duplicates

// Schema Cache
export { SchemaCacheService, getSchemaCache } from './schema-cache';

// Delta Service
export { DeltaService, getDeltaService } from './delta-service';
export type { DeltaResult } from './delta-service';

// Scheduler Service (BullMQ job scheduling)
export { SchedulerService, getSchedulerService } from './scheduler-service';
export type {
  SchedulerInfo,
  ScheduleJobData,
} from './scheduler-service';
// Note: ScheduleConfig for mappings is exported from types/mapping.ts
// The scheduler service has its own ScheduleConfig that includes mappingId

// Sync Worker (BullMQ worker)
export { SyncWorker, createSyncWorker } from './sync-worker';
export type { SyncWorkerOptions, SyncJobResult } from './sync-worker';

// Webhook Processor
export {
  WebhookProcessor,
  createWebhookProcessor,
  getWebhookProcessor,
  updateWebhookProcessor,
  verifyHmac,
  isDeleteTopic,
  HEADER_TO_RESOURCE,
} from './webhook-processor';
export type { WebhookProcessorOptions } from './webhook-processor';

// Webhook Queue (BullMQ)
export { WebhookQueueService, createWebhookQueue, getWebhookQueue } from './webhook-queue';
export type { WebhookQueueOptions, QueueStats } from './webhook-queue';

// Webhook Stats
export { WebhookStatsService, getWebhookStatsService } from './webhook-stats';
