/**
 * Delta Service - Compare Shopify data vs Database records
 *
 * Features:
 * - Fetch IDs from both sources and compare
 * - 10K record safety limit with sampling
 * - Returns counts and sample differing IDs for debugging
 */

import type { MappingConfig } from '../types/mapping';
import { getMappingService } from './mapping-service';
import { getConfigService } from './config-service';
import { getConnector } from '../connectors/database';
import { getShopifyConnector } from '../connectors/shopify';

const SAMPLE_LIMIT = 10000;
const SAMPLE_IDS_COUNT = 10;

export interface DeltaResult {
  mappingId: string;
  mappingName: string;
  shopifyCount: number;
  databaseCount: number;
  toAdd: number;
  toRemove: number;
  inSync: number;
  sampled: boolean;
  sampleLimit: number;
  sampleToAdd?: string[];
  sampleToRemove?: string[];
  calculatedAt: string;
  durationMs: number;
}

export class DeltaService {
  private mappingService = getMappingService();
  private configService = getConfigService();

  async calculateDelta(mappingId: string): Promise<DeltaResult> {
    const startTime = Date.now();

    const mapping = await this.mappingService.getById(mappingId);
    if (!mapping) {
      throw new Error(`Mapping not found: ${mappingId}`);
    }

    if (!mapping.keyMapping) {
      throw new Error(`Mapping ${mapping.name} has no key mapping configured`);
    }

    console.log(`[DeltaService] Calculating delta for mapping: ${mapping.name}`, {
      sourceResource: mapping.sourceResource,
      targetTable: mapping.targetTable,
    });

    const [shopifyIds, databaseIds] = await Promise.all([
      this.fetchShopifyIds(mapping),
      this.fetchDatabaseIds(mapping),
    ]);

    const sampled =
      shopifyIds.size >= SAMPLE_LIMIT || databaseIds.size >= SAMPLE_LIMIT;

    if (sampled) {
      console.warn('[DeltaService] Delta calculation hit sample limit', {
        shopifyCount: shopifyIds.size,
        databaseCount: databaseIds.size,
        limit: SAMPLE_LIMIT,
      });
    }

    // Calculate differences
    const toAddSet = new Set<string>();
    const toRemoveSet = new Set<string>();

    for (const id of shopifyIds) {
      if (!databaseIds.has(id)) {
        toAddSet.add(id);
      }
    }

    for (const id of databaseIds) {
      if (!shopifyIds.has(id)) {
        toRemoveSet.add(id);
      }
    }

    const inSync = shopifyIds.size - toAddSet.size;
    const durationMs = Date.now() - startTime;

    console.log('[DeltaService] Delta calculation complete', {
      mappingId,
      toAdd: toAddSet.size,
      toRemove: toRemoveSet.size,
      inSync,
      durationMs,
    });

    return {
      mappingId,
      mappingName: mapping.name,
      shopifyCount: shopifyIds.size,
      databaseCount: databaseIds.size,
      toAdd: toAddSet.size,
      toRemove: toRemoveSet.size,
      inSync,
      sampled,
      sampleLimit: SAMPLE_LIMIT,
      sampleToAdd: Array.from(toAddSet).slice(0, SAMPLE_IDS_COUNT),
      sampleToRemove: Array.from(toRemoveSet).slice(0, SAMPLE_IDS_COUNT),
      calculatedAt: new Date().toISOString(),
      durationMs,
    };
  }

  private async fetchShopifyIds(mapping: MappingConfig): Promise<Set<string>> {
    const config = await this.configService.load();
    if (!config.shopify) {
      throw new Error('Shopify not configured');
    }

    const connector = getShopifyConnector(config.shopify);
    const ids = new Set<string>();

    const resource = mapping.sourceResource;
    const keyField = mapping.keyMapping!.sourceField;

    // Build GraphQL query for the key field only
    const pluralResource = this.pluralize(resource);
    const query = `
      query($first: Int!, $after: String) {
        ${pluralResource}(first: $first, after: $after) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            ${keyField}
          }
        }
      }
    `;

    let hasNextPage = true;
    let cursor: string | null = null;

    type PageData = {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: Array<Record<string, unknown>>;
    };
    type QueryResult = { [key: string]: PageData };

    while (hasNextPage && ids.size < SAMPLE_LIMIT) {
      const result: QueryResult = await connector.query<QueryResult>(query, {
        first: Math.min(250, SAMPLE_LIMIT - ids.size),
        after: cursor,
      });

      const data: PageData | undefined = result[pluralResource];
      if (!data) {
        throw new Error(`No data returned for ${pluralResource}`);
      }

      for (const node of data.nodes) {
        const id = this.extractNestedValue(node, keyField);
        if (id !== null && id !== undefined) {
          ids.add(String(id));
        }
      }

      hasNextPage = data.pageInfo.hasNextPage;
      cursor = data.pageInfo.endCursor;
    }

    console.log(`[DeltaService] Fetched ${ids.size} IDs from Shopify`, {
      resource,
      keyField,
    });

    return ids;
  }

  private async fetchDatabaseIds(mapping: MappingConfig): Promise<Set<string>> {
    const config = await this.configService.load();
    if (!config.database?.connectionString) {
      throw new Error('Database not configured');
    }

    const connector = await getConnector(config.database.connectionString);
    const ids = new Set<string>();

    const table = mapping.targetTable;
    const keyColumn = mapping.keyMapping!.targetColumn;

    // Query with limit
    const sql = `SELECT TOP ${SAMPLE_LIMIT} ${this.quoteIdentifier(keyColumn)} FROM ${table}`;

    try {
      const rows = await connector.query<Record<string, unknown>>(sql);
      for (const row of rows) {
        const id = row[keyColumn];
        if (id !== null && id !== undefined) {
          ids.add(String(id));
        }
      }
    } catch {
      // Try without TOP (for PostgreSQL/MySQL)
      const sqlAlt = `SELECT ${this.quoteIdentifier(keyColumn)} FROM ${table} LIMIT ${SAMPLE_LIMIT}`;
      const rows = await connector.query<Record<string, unknown>>(sqlAlt);
      for (const row of rows) {
        const id = row[keyColumn];
        if (id !== null && id !== undefined) {
          ids.add(String(id));
        }
      }
    }

    console.log(`[DeltaService] Fetched ${ids.size} IDs from database`, {
      table,
      keyColumn,
    });

    return ids;
  }

  private pluralize(resource: string): string {
    const lower = resource.toLowerCase();
    if (lower === 'productvariant') return 'productVariants';
    if (lower === 'inventoryitem') return 'inventoryItems';
    if (lower === 'inventorylevel') return 'inventoryLevels';
    if (lower.endsWith('y')) return lower.slice(0, -1) + 'ies';
    if (lower.endsWith('s')) return lower;
    return lower + 's';
  }

  private extractNestedValue(
    obj: Record<string, unknown>,
    path: string
  ): unknown {
    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined) return null;
      if (typeof current !== 'object') return null;
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }

  private quoteIdentifier(name: string): string {
    // Basic SQL identifier quoting
    if (name.includes('.')) {
      return name
        .split('.')
        .map((p) => `[${p}]`)
        .join('.');
    }
    return `[${name}]`;
  }
}

// Singleton instance
let deltaServiceInstance: DeltaService | null = null;

export function getDeltaService(): DeltaService {
  if (!deltaServiceInstance) {
    deltaServiceInstance = new DeltaService();
  }
  return deltaServiceInstance;
}
