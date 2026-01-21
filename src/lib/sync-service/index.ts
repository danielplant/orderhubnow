/**
 * Sync Service - Main Entry Point
 *
 * This module provides the sync service functionality for OrderHub Admin.
 * It handles ETL (Extract, Transform, Load) operations between Shopify and
 * the OrderHub database.
 *
 * Key components:
 * - Types: Mapping, sync, webhook, and connector type definitions
 * - Connectors: Database, Redis, and Shopify connection management
 * - Services: Config, mapping, sync history, and transform services
 *
 * Usage:
 * ```typescript
 * import { getMappingService, getConfigService } from '@/lib/sync-service';
 *
 * const mappingService = getMappingService();
 * const mappings = await mappingService.getAll();
 * ```
 */

// Types
export * from './types';

// Connectors
export {
  getConnector,
  closeConnector,
  closeAllConnectors,
  SqlServerConnector,
  parseConnectionString,
  maskConnectionString,
} from './connectors/database';

export {
  getRedisClient,
  getRedisConnectionOptions,
  closeRedis,
  testRedisConnection,
  isRedisConfigured,
  getRedisUrl,
  maskRedisUrl,
} from './connectors/redis';

export type { RedisTestResult } from './connectors/redis';

export {
  ShopifyConnector,
  getShopifyConnector,
  clearShopifyConnectors,
  getShopifyConfigFromEnv,
} from './connectors/shopify';

// Services
export * from './services';
