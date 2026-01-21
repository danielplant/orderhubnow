/**
 * Shopify Fetcher - Handles bulk operations and paginated queries
 *
 * Features:
 * - Bulk operations API for full sync (rate-limit exempt)
 * - JSONL streaming for memory efficiency
 * - Paginated queries for incremental sync
 * - Configurable timeouts and polling intervals
 */

import { Readable } from 'stream';
import * as readline from 'readline';
import type { ShopifyConnector } from '../connectors/shopify';

// ============================================================================
// Types
// ============================================================================

export type BulkOperationStatus =
  | 'CREATED'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELED'
  | 'CANCELING';

export interface BulkOperationResult {
  id: string;
  status: BulkOperationStatus;
  objectCount: number;
  fileSize: number;
  url: string | null;
  errorCode: string | null;
  partialDataUrl: string | null;
}

export interface BulkOperationOptions {
  timeoutMs?: number; // Default 10 minutes
  pollIntervalMs?: number; // Initial poll interval, default 3s
  maxPollIntervalMs?: number; // Max poll interval with backoff, default 30s
}

export interface IncrementalFetchOptions {
  resource: string; // "products" or "productVariants"
  fields: string[]; // Fields to fetch
  updatedAfter: Date;
  batchSize?: number; // Default 250
  signal?: AbortSignal; // For cancellation
}

export interface ShopifyRecord {
  id: string;
  [key: string]: unknown;
}

// ============================================================================
// ShopifyFetcher Class
// ============================================================================

export class ShopifyFetcher {
  private connector: ShopifyConnector;

  constructor(connector: ShopifyConnector) {
    this.connector = connector;
  }

  // ==========================================================================
  // Bulk Operations (Full Sync)
  // ==========================================================================

  /**
   * Start a bulk query operation.
   * Returns the operation ID for polling.
   */
  async startBulkQuery(query: string): Promise<string> {
    const mutation = `
      mutation {
        bulkOperationRunQuery(
          query: """
            ${query}
          """
        ) {
          bulkOperation {
            id
            status
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const data = await this.connector.query<{
      bulkOperationRunQuery: {
        bulkOperation: { id: string; status: string } | null;
        userErrors: Array<{ field: string[]; message: string }>;
      };
    }>(mutation);

    const { bulkOperation, userErrors } = data.bulkOperationRunQuery;

    if (userErrors && userErrors.length > 0) {
      const messages = userErrors.map((e) => e.message).join('; ');
      throw new Error(`Bulk operation failed: ${messages}`);
    }

    if (!bulkOperation) {
      throw new Error('No bulk operation returned');
    }

    return bulkOperation.id;
  }

  /**
   * Cancel a running bulk operation.
   */
  async cancelBulkOperation(operationId: string): Promise<boolean> {
    const mutation = `
      mutation {
        bulkOperationCancel(id: "${operationId}") {
          bulkOperation {
            id
            status
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    try {
      await this.connector.query(mutation);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check the status of a bulk operation.
   */
  async checkBulkOperation(operationId: string): Promise<BulkOperationResult> {
    const query = `
      query {
        node(id: "${operationId}") {
          ... on BulkOperation {
            id
            status
            objectCount
            fileSize
            url
            errorCode
            partialDataUrl
          }
        }
      }
    `;

    const data = await this.connector.query<{
      node: {
        id: string;
        status: BulkOperationStatus;
        objectCount: number;
        fileSize: number;
        url: string | null;
        errorCode: string | null;
        partialDataUrl: string | null;
      } | null;
    }>(query);

    if (!data.node) {
      throw new Error(`Bulk operation ${operationId} not found`);
    }

    return data.node;
  }

  /**
   * Poll until bulk operation completes or fails.
   * Uses exponential backoff for polling intervals.
   */
  async waitForBulkOperation(
    operationId: string,
    options: BulkOperationOptions = {},
    signal?: AbortSignal
  ): Promise<BulkOperationResult> {
    const timeoutMs = options.timeoutMs ?? 10 * 60 * 1000; // 10 minutes
    const initialPollMs = options.pollIntervalMs ?? 3000;
    const maxPollMs = options.maxPollIntervalMs ?? 30000;

    const startTime = Date.now();
    let pollInterval = initialPollMs;
    let pollCount = 0;

    while (Date.now() - startTime < timeoutMs) {
      // Check for cancellation
      if (signal?.aborted) {
        await this.cancelBulkOperation(operationId);
        throw new Error('Bulk operation cancelled');
      }

      const result = await this.checkBulkOperation(operationId);
      pollCount++;

      console.log(
        `[ShopifyFetcher] Poll #${pollCount}: status=${result.status}, objects=${result.objectCount}`
      );

      // Terminal states
      if (result.status === 'COMPLETED') {
        return result;
      }

      if (result.status === 'FAILED') {
        throw new Error(
          `Bulk operation failed: ${result.errorCode || 'Unknown error'}`
        );
      }

      if (result.status === 'CANCELED') {
        throw new Error('Bulk operation was cancelled');
      }

      // Wait with exponential backoff
      await this.delay(pollInterval);
      pollInterval = Math.min(pollInterval * 1.5, maxPollMs);
    }

    // Timeout - try to cancel
    await this.cancelBulkOperation(operationId);
    throw new Error(`Bulk operation timed out after ${timeoutMs}ms`);
  }

  /**
   * Stream JSONL results from a bulk operation URL.
   * Each line is a JSON object representing a Shopify resource.
   */
  async *streamBulkResults(
    url: string,
    signal?: AbortSignal
  ): AsyncGenerator<ShopifyRecord> {
    const response = await fetch(url, { signal });

    if (!response.ok) {
      throw new Error(`Failed to download bulk results: ${response.status}`);
    }

    if (!response.body) {
      throw new Error('No response body from bulk results URL');
    }

    // Convert web ReadableStream to Node.js Readable
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nodeStream = Readable.fromWeb(response.body as any);

    const rl = readline.createInterface({
      input: nodeStream,
      crlfDelay: Infinity,
    });

    let lineCount = 0;

    for await (const line of rl) {
      if (signal?.aborted) {
        rl.close();
        throw new Error('Stream cancelled');
      }

      if (!line.trim()) continue;

      try {
        const record = JSON.parse(line) as ShopifyRecord;
        lineCount++;
        yield record;
      } catch (parseErr) {
        console.error(
          `[ShopifyFetcher] Failed to parse JSONL line ${lineCount + 1}: ${line}`,
          parseErr
        );
        // Continue processing other lines
      }
    }

    console.log(
      `[ShopifyFetcher] Streamed ${lineCount} records from bulk results`
    );
  }

  /**
   * Convenience method: Run a full bulk query and stream results.
   */
  async *runBulkQuery(
    query: string,
    options: BulkOperationOptions = {},
    signal?: AbortSignal
  ): AsyncGenerator<ShopifyRecord> {
    // Start the operation
    const operationId = await this.startBulkQuery(query);
    console.log(`[ShopifyFetcher] Started bulk operation: ${operationId}`);

    try {
      // Wait for completion
      const result = await this.waitForBulkOperation(operationId, options, signal);

      if (!result.url) {
        console.log(
          '[ShopifyFetcher] Bulk operation completed but no data URL (empty results)'
        );
        return;
      }

      // Stream results
      yield* this.streamBulkResults(result.url, signal);
    } catch (error) {
      // Try to cancel if something went wrong
      if (error instanceof Error && !error.message.includes('cancelled')) {
        await this.cancelBulkOperation(operationId).catch(() => {});
      }
      throw error;
    }
  }

  // ==========================================================================
  // Paginated Queries (Incremental Sync)
  // ==========================================================================

  /**
   * Build a GraphQL query for incremental fetch with cursor pagination.
   */
  private buildIncrementalQuery(
    resource: string,
    fields: string[],
    updatedAfter: Date,
    batchSize: number,
    cursor?: string
  ): string {
    const afterArg = cursor ? `, after: "${cursor}"` : '';
    const dateFilter = updatedAfter.toISOString();

    // Map resource name to GraphQL query name
    const queryName = this.getQueryName(resource);
    const filterArg = this.getFilterArg(resource, dateFilter);

    return `
      query {
        ${queryName}(first: ${batchSize}${afterArg}${filterArg}) {
          edges {
            cursor
            node {
              id
              ${fields.join('\n              ')}
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;
  }

  /**
   * Map resource name to GraphQL query name.
   */
  private getQueryName(resource: string): string {
    const mapping: Record<string, string> = {
      Product: 'products',
      ProductVariant: 'productVariants',
      products: 'products',
      productVariants: 'productVariants',
      Order: 'orders',
      orders: 'orders',
      Customer: 'customers',
      customers: 'customers',
      InventoryItem: 'inventoryItems',
      inventoryItems: 'inventoryItems',
    };
    return mapping[resource] || resource.toLowerCase() + 's';
  }

  /**
   * Get filter argument for updated_at queries.
   */
  private getFilterArg(resource: string, dateFilter: string): string {
    // Shopify uses query parameter for filtering
    return `, query: "updated_at:>'${dateFilter}'"`;
  }

  /**
   * Fetch records incrementally using cursor pagination.
   */
  async *fetchIncremental(
    options: IncrementalFetchOptions
  ): AsyncGenerator<ShopifyRecord> {
    const { resource, fields, updatedAfter, signal } = options;
    const batchSize = options.batchSize ?? 250;

    let cursor: string | undefined;
    let hasNextPage = true;
    let totalFetched = 0;
    let pageCount = 0;

    while (hasNextPage) {
      // Check for cancellation
      if (signal?.aborted) {
        throw new Error('Incremental fetch cancelled');
      }

      const query = this.buildIncrementalQuery(
        resource,
        fields,
        updatedAfter,
        batchSize,
        cursor
      );

      const queryName = this.getQueryName(resource);

      const data = await this.connector.query<{
        [key: string]: {
          edges: Array<{ cursor: string; node: ShopifyRecord }>;
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
        };
      }>(query);

      const result = data[queryName];

      if (!result) {
        throw new Error(`Unexpected response structure for ${queryName}`);
      }

      pageCount++;

      for (const edge of result.edges) {
        totalFetched++;
        yield edge.node;
      }

      hasNextPage = result.pageInfo.hasNextPage;
      cursor = result.pageInfo.endCursor || undefined;

      console.log(
        `[ShopifyFetcher] Incremental page ${pageCount}: fetched ${result.edges.length} records (total: ${totalFetched})`
      );
    }

    console.log(
      `[ShopifyFetcher] Incremental sync complete: ${totalFetched} records in ${pageCount} pages`
    );
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  /**
   * Build a bulk query from a mapping configuration.
   */
  buildBulkQueryFromMapping(sourceResource: string, fields: string[]): string {
    const queryName = this.getQueryName(sourceResource);

    // Dedupe and format fields
    const uniqueFields = [...new Set(['id', ...fields])];
    const formattedFields = this.formatFieldsForQuery(uniqueFields);

    return `
      {
        ${queryName} {
          edges {
            node {
              ${formattedFields}
            }
          }
        }
      }
    `;
  }

  /**
   * Format fields for GraphQL query, handling nested fields.
   */
  private formatFieldsForQuery(fields: string[]): string {
    const nested = new Map<string, string[]>();
    const simple: string[] = [];

    for (const field of fields) {
      if (field.includes('.')) {
        const parts = field.split('.');
        const parent = parts[0] ?? '';
        const child = parts.slice(1).join('.');
        if (parent && !nested.has(parent)) {
          nested.set(parent, []);
        }
        if (parent && child) {
          nested.get(parent)!.push(child);
        }
      } else {
        simple.push(field);
      }
    }

    const parts = [...simple];

    for (const [parent, children] of nested) {
      if (parent === 'metafields') {
        // Metafields need special handling with first argument
        const metafieldFields = children.map((c) => {
          const splitParts = c.split('.');
          const namespace = splitParts[0] ?? '';
          const key = splitParts[1] ?? '';
          return `metafield(namespace: "${namespace}", key: "${key}") { value }`;
        });
        parts.push(...metafieldFields);
      } else {
        parts.push(`${parent} { ${this.formatFieldsForQuery(children)} }`);
      }
    }

    return parts.join('\n              ');
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
