/**
 * Webhook Processor - Core webhook processing logic
 *
 * Features:
 * - Topic-to-resource mapping
 * - Find matching mappings by resource
 * - Transform and upsert records
 * - Handle delete webhooks
 * - Skip if bulk sync running
 */

import crypto from 'crypto';
import type { WebhookJob, WebhookProcessResult } from '../types/webhook';
import type { MappingConfig } from '../types/mapping';
import type { DatabaseConnector } from '../types/database';
import { TransformEngine, type ShopifyRecord } from './transform-engine';
import { DatabaseWriter } from './database-writer';
import { getMappingService } from './mapping-service';
import type { SyncEngine } from './sync-engine';

// ============================================================================
// Constants
// ============================================================================

/**
 * Map webhook topic headers to Shopify resource types.
 */
export const HEADER_TO_RESOURCE: Record<string, string> = {
  'products/create': 'Product',
  'products/update': 'Product',
  'products/delete': 'Product',
  'collections/create': 'Collection',
  'collections/update': 'Collection',
  'collections/delete': 'Collection',
  'orders/create': 'Order',
  'orders/updated': 'Order',
  'orders/cancelled': 'Order',
  'customers/create': 'Customer',
  'customers/update': 'Customer',
  'customers/delete': 'Customer',
  'inventory_levels/update': 'InventoryLevel',
};

/**
 * Check if a topic is a delete operation.
 */
export function isDeleteTopic(topic: string): boolean {
  return topic.endsWith('/delete') || topic.endsWith('/cancelled');
}

// ============================================================================
// HMAC Verification
// ============================================================================

/**
 * Verify Shopify webhook HMAC signature.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export function verifyHmac(
  rawBody: Buffer,
  hmacHeader: string,
  secret: string
): boolean {
  const computedHmac = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('base64');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(computedHmac),
      Buffer.from(hmacHeader)
    );
  } catch {
    // Buffers have different lengths
    return false;
  }
}

// ============================================================================
// Types
// ============================================================================

export interface WebhookProcessorOptions {
  dbConnector: DatabaseConnector | null;
  syncEngine: SyncEngine | null;
}

// ============================================================================
// WebhookProcessor Class
// ============================================================================

export class WebhookProcessor {
  private mappingService = getMappingService();
  private dbConnector: DatabaseConnector | null;
  private syncEngine: SyncEngine | null;

  constructor(options: WebhookProcessorOptions) {
    this.dbConnector = options.dbConnector;
    this.syncEngine = options.syncEngine;
  }

  /**
   * Update dependencies (called when connections change).
   */
  updateDependencies(options: Partial<WebhookProcessorOptions>): void {
    if (options.dbConnector !== undefined) {
      this.dbConnector = options.dbConnector;
    }
    if (options.syncEngine !== undefined) {
      this.syncEngine = options.syncEngine;
    }
  }

  /**
   * Process a webhook job.
   */
  async process(job: WebhookJob): Promise<WebhookProcessResult> {
    const startTime = Date.now();
    const result: WebhookProcessResult = {
      webhookId: job.id,
      topic: job.topic,
      success: true,
      mappingsProcessed: [],
      recordsWritten: 0,
      errors: [],
      processingMs: 0,
    };

    // Check if we have a database connection
    if (!this.dbConnector) {
      result.success = false;
      result.errors.push('No database connection configured');
      result.processingMs = Date.now() - startTime;
      return result;
    }

    // Get resource from topic
    const resource = HEADER_TO_RESOURCE[job.topic];
    if (!resource) {
      console.warn(`[WebhookProcessor] Unknown topic: ${job.topic}`);
      result.processingMs = Date.now() - startTime;
      return result; // Success with no mappings (not an error)
    }

    // Find mappings for this resource
    const mappings = await this.findMatchingMappings(resource);
    if (mappings.length === 0) {
      console.log(`[WebhookProcessor] No mappings for resource: ${resource}`);
      result.processingMs = Date.now() - startTime;
      return result;
    }

    // Check if it's a delete operation
    const isDelete = isDeleteTopic(job.topic);

    // Process each matching mapping
    for (const mapping of mappings) {
      try {
        // Skip if bulk sync is running for this mapping
        if (this.syncEngine?.getRunningSync(mapping.id)) {
          console.log(
            `[WebhookProcessor] Skipping ${job.topic} - bulk sync running for ${mapping.id}`
          );
          continue;
        }

        if (isDelete) {
          await this.handleDelete(mapping, job.payload);
        } else {
          const written = await this.transformAndUpsert(mapping, job.payload);
          result.recordsWritten += written;
        }

        result.mappingsProcessed.push(mapping.id);
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        result.errors.push(`${mapping.name}: ${error}`);
        console.error(
          `[WebhookProcessor] Error processing ${mapping.name}: ${error}`
        );
      }
    }

    // Mark as failed if all mappings errored
    if (result.errors.length > 0 && result.mappingsProcessed.length === 0) {
      result.success = false;
    }

    result.processingMs = Date.now() - startTime;
    return result;
  }

  /**
   * Find mappings that use the given resource.
   */
  private async findMatchingMappings(
    resource: string
  ): Promise<MappingConfig[]> {
    const allMappings = await this.mappingService.getAll();

    return allMappings.filter((m) => {
      // Must have webhooks enabled (default true if not set)
      if (m.webhookEnabled === false) {
        return false;
      }

      // Match by sourceResource
      return m.sourceResource === resource;
    });
  }

  /**
   * Transform webhook payload and upsert to database.
   */
  private async transformAndUpsert(
    mapping: MappingConfig,
    payload: Record<string, unknown>
  ): Promise<number> {
    if (!this.dbConnector) {
      throw new Error('No database connection');
    }

    // Create transform engine
    const transformEngine = new TransformEngine(this.dbConnector);

    // Flatten payload and create ShopifyRecord format
    const flatData = this.flattenPayload(payload, mapping.sourceResource);
    const record: ShopifyRecord = {
      id: String(payload.id ?? payload.admin_graphql_api_id ?? ''),
      ...flatData,
    };

    // Transform the record
    const transformResult = await transformEngine.transformBatch(
      mapping,
      [record],
      { dryRun: false }
    );

    // Get successful results
    const successfulResults = transformResult.results.filter(
      (r) => r.status === 'success' || r.status === 'partial'
    );

    if (successfulResults.length === 0) {
      return 0;
    }

    // Upsert to database
    const dbWriter = new DatabaseWriter(this.dbConnector);

    const writeResult = await dbWriter.upsert({
      table: mapping.targetTable,
      keyColumn: mapping.keyMapping?.targetColumn ?? 'id',
      rows: successfulResults.map((r) => r.targetRow),
      onConflict: 'update',
    });

    return writeResult.inserted + writeResult.updated;
  }

  /**
   * Handle delete webhook.
   */
  private async handleDelete(
    mapping: MappingConfig,
    payload: Record<string, unknown>
  ): Promise<void> {
    if (!this.dbConnector) {
      throw new Error('No database connection');
    }

    const strategy = mapping.deleteStrategy ?? 'hard';

    if (strategy === 'ignore') {
      console.log(
        `[WebhookProcessor] Ignoring delete for mapping ${mapping.name}`
      );
      return;
    }

    // Get the key value from payload
    const keySourceField = mapping.keyMapping?.sourceField ?? 'id';
    const keyTargetColumn = mapping.keyMapping?.targetColumn ?? 'id';

    // Try different possible locations for the key
    let keyValue = payload[keySourceField];
    if (!keyValue && payload.id) {
      keyValue = payload.id;
    }
    if (!keyValue && payload.admin_graphql_api_id) {
      // Extract numeric ID from GID
      const gid = String(payload.admin_graphql_api_id);
      const match = gid.match(/\/(\d+)$/);
      keyValue = match ? match[1] : gid;
    }

    if (!keyValue) {
      throw new Error(`Cannot determine key value for delete operation`);
    }

    const dbWriter = new DatabaseWriter(this.dbConnector);

    if (strategy === 'hard') {
      await dbWriter.deleteByKey(mapping.targetTable, keyTargetColumn, keyValue);
    } else if (strategy === 'soft') {
      const column = mapping.softDeleteColumn ?? 'deletedAt';
      await dbWriter.updateByKey(mapping.targetTable, keyTargetColumn, keyValue, {
        [column]: new Date().toISOString(),
      });
    }
  }

  /**
   * Flatten webhook payload to match expected field paths.
   * Webhook payloads use snake_case, need to handle various formats.
   */
  private flattenPayload(
    payload: Record<string, unknown>,
    _resource: string
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    // Copy top-level fields
    for (const [key, value] of Object.entries(payload)) {
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        // Flatten nested objects
        for (const [nestedKey, nestedValue] of Object.entries(
          value as Record<string, unknown>
        )) {
          result[`${key}.${nestedKey}`] = nestedValue;
        }
      }
      result[key] = value;
    }

    // Map common webhook fields to GraphQL field names
    const fieldMappings: Record<string, string> = {
      admin_graphql_api_id: 'id',
      created_at: 'createdAt',
      updated_at: 'updatedAt',
      published_at: 'publishedAt',
      product_id: 'product.id',
      inventory_item_id: 'inventoryItem.id',
    };

    for (const [webhookField, graphqlField] of Object.entries(fieldMappings)) {
      if (
        payload[webhookField] !== undefined &&
        result[graphqlField] === undefined
      ) {
        result[graphqlField] = payload[webhookField];
      }
    }

    return result;
  }
}

// Factory function
export function createWebhookProcessor(
  options: WebhookProcessorOptions
): WebhookProcessor {
  return new WebhookProcessor(options);
}

// Singleton instance
let webhookProcessorInstance: WebhookProcessor | null = null;

/**
 * Get singleton webhook processor instance.
 * Lazily initializes with null dependencies (they can be updated later).
 */
export function getWebhookProcessor(): WebhookProcessor {
  if (!webhookProcessorInstance) {
    webhookProcessorInstance = new WebhookProcessor({
      dbConnector: null,
      syncEngine: null,
    });
  }
  return webhookProcessorInstance;
}

/**
 * Update the singleton processor's dependencies.
 */
export function updateWebhookProcessor(
  options: Partial<WebhookProcessorOptions>
): void {
  if (webhookProcessorInstance) {
    webhookProcessorInstance.updateDependencies(options);
  }
}
