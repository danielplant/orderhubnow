/**
 * Mapping Preview - Generate preview of mapping results using live Shopify data
 *
 * Features:
 * - Fetch sample records from Shopify
 * - Apply mapping transforms
 * - Show before/after comparison
 * - Report errors per row
 */

import type { ShopifyConnector } from '../connectors/shopify';
import type { DatabaseConnector } from '../types/database';
import type { MappingConfig, FieldMapping, Transform } from '../types/mapping';
import { TransformEngine, type ShopifyRecord } from './transform-engine';

// ============================================================================
// Preview Result Types
// ============================================================================

export interface PreviewRow {
  source: Record<string, unknown>;
  target: Record<string, unknown>;
  transformsApplied: string[];
  errors: string[];
}

export interface PreviewResult {
  success: boolean;
  sampleRows: PreviewRow[];
  totalEstimate: number;
  errors: Array<{ row: number; message: string }>;
  summary: {
    rowsFetched: number;
    rowsTransformed: number;
    rowsWithErrors: number;
  };
}

// ============================================================================
// GraphQL Query Builders
// ============================================================================

/**
 * Build a GraphQL query to fetch sample records for a resource.
 */
function buildSampleQuery(
  resource: string,
  fields: string[],
  _limit: number
): { query: string; path: string } {
  // Map resource names to their GraphQL query root
  const queryRoots: Record<string, { root: string; connection: string }> = {
    Product: { root: 'products', connection: 'ProductConnection' },
    ProductVariant: {
      root: 'productVariants',
      connection: 'ProductVariantConnection',
    },
    Collection: { root: 'collections', connection: 'CollectionConnection' },
    Customer: { root: 'customers', connection: 'CustomerConnection' },
    Order: { root: 'orders', connection: 'OrderConnection' },
    InventoryItem: {
      root: 'inventoryItems',
      connection: 'InventoryItemConnection',
    },
  };

  const queryRoot = queryRoots[resource];
  if (!queryRoot) {
    throw new Error(`Unknown resource type: ${resource}`);
  }

  // Build field selection, handling nested fields
  const fieldSelection = buildFieldSelection(fields);

  const query = `
    query($first: Int!) {
      ${queryRoot.root}(first: $first) {
        edges {
          node {
            id
            ${fieldSelection}
          }
        }
        pageInfo {
          hasNextPage
        }
      }
    }
  `;

  return { query, path: queryRoot.root };
}

/**
 * Build GraphQL field selection from field paths.
 */
function buildFieldSelection(fields: string[]): string {
  const selections: Set<string> = new Set();
  const nestedFields: Map<string, Set<string>> = new Map();

  for (const field of fields) {
    const parts = field.split('.');

    if (parts.length === 1) {
      // Simple field
      selections.add(field);
    } else {
      // Nested field - handle specially
      const parent = parts[0]!;

      // Handle metafields specially
      if (parent === 'metafields') {
        // For metafields, we query them with namespace and key
        const namespace = parts[1];
        const key = parts[2];
        if (namespace && key) {
          selections.add(
            `metafield_${namespace}_${key}: metafield(namespace: "${namespace}", key: "${key}") { value }`
          );
        }
      } else {
        // Regular nested field
        if (!nestedFields.has(parent)) {
          nestedFields.set(parent, new Set());
        }
        nestedFields.get(parent)!.add(parts.slice(1).join('.'));
      }
    }
  }

  // Build nested selections
  for (const [parent, childFields] of nestedFields) {
    const childSelection = buildFieldSelection([...childFields]);
    selections.add(`${parent} { ${childSelection} }`);
  }

  return [...selections].join('\n            ');
}

// ============================================================================
// Transform Application
// ============================================================================

/**
 * Apply a transform to a source value.
 */
function applyTransform(
  value: unknown,
  transform: Transform,
  sourceData: Record<string, unknown>
): { result: unknown; applied: string; error?: string } {
  try {
    switch (transform.type) {
      case 'direct':
        return { result: value, applied: 'direct' };

      case 'coerce':
        return {
          result: coerceValue(value, transform.targetType),
          applied: `coerce to ${transform.targetType}`,
        };

      case 'expression':
        return {
          result: evaluateExpression(transform.formula, sourceData),
          applied: `expression: ${transform.formula}`,
        };

      case 'lookup':
        // Lookup requires database access - return placeholder
        return {
          result: `[LOOKUP: ${transform.table}.${transform.returnColumn}]`,
          applied: `lookup in ${transform.table}`,
        };

      case 'template':
        return {
          result: applyTemplate(transform.template, sourceData),
          applied: `template: ${transform.template}`,
        };

      case 'default':
        if (value === null || value === undefined || !transform.onlyIfNull) {
          return {
            result: value ?? transform.value,
            applied: `default: ${transform.value}`,
          };
        }
        return { result: value, applied: 'direct (default not applied)' };

      default:
        return { result: value, applied: 'unknown transform' };
    }
  } catch (error) {
    return {
      result: null,
      applied: `${transform.type} (failed)`,
      error: error instanceof Error ? error.message : 'Transform failed',
    };
  }
}

/**
 * Coerce a value to a target type.
 */
function coerceValue(value: unknown, targetType: string): unknown {
  if (value === null || value === undefined) {
    return null;
  }

  const lower = targetType.toLowerCase();

  if (lower.includes('int') || lower === 'number') {
    const num = Number(value);
    return isNaN(num) ? null : Math.floor(num);
  }

  if (
    lower.includes('decimal') ||
    lower.includes('float') ||
    lower.includes('numeric')
  ) {
    const num = Number(value);
    return isNaN(num) ? null : num;
  }

  if (lower === 'boolean' || lower === 'bit') {
    if (typeof value === 'boolean') return value;
    if (value === 'true' || value === '1') return true;
    if (value === 'false' || value === '0') return false;
    return Boolean(value);
  }

  if (lower.includes('datetime') || lower.includes('date')) {
    const date = new Date(value as string);
    return isNaN(date.getTime()) ? null : date.toISOString();
  }

  // String types
  return String(value);
}

/**
 * Evaluate a simple expression.
 */
function evaluateExpression(
  formula: string,
  sourceData: Record<string, unknown>
): unknown {
  // Create a safe subset of values
  const safeValues: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(sourceData)) {
    // Only include primitive values
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value === null
    ) {
      safeValues[key] = value;
    }
  }

  // Build function with values as local variables
  const varDeclarations = Object.entries(safeValues)
    .map(([k, v]) => `const ${k} = ${JSON.stringify(v)};`)
    .join('\n');

  try {
     
    const fn = new Function(`
      ${varDeclarations}
      return (${formula});
    `);
    return fn();
  } catch {
    throw new Error(`Expression evaluation failed: ${formula}`);
  }
}

/**
 * Apply a template string with {fieldName} placeholders.
 */
function applyTemplate(
  template: string,
  sourceData: Record<string, unknown>
): string {
  return template.replace(/\{([^}]+)\}/g, (match, fieldName) => {
    const value = sourceData[fieldName];
    return value !== undefined && value !== null ? String(value) : '';
  });
}

// ============================================================================
// Mapping Preview Service
// ============================================================================

export class MappingPreview {
  /**
   * Generate a preview of mapping results using live Shopify data.
   */
  async preview(
    config: MappingConfig,
    shopifyConnector: ShopifyConnector,
    limit = 5
  ): Promise<PreviewResult> {
    const sampleRows: PreviewRow[] = [];
    const globalErrors: Array<{ row: number; message: string }> = [];
    let totalEstimate = 0;

    try {
      // Get fields needed for preview
      const neededFields = this.extractSourceFields(config);

      // Build and execute query
      const { query, path } = buildSampleQuery(
        config.sourceResource,
        neededFields,
        limit
      );

      type QueryResult = {
        [key: string]: {
          edges: Array<{ node: Record<string, unknown> }>;
          pageInfo: { hasNextPage: boolean };
        };
      };

      const data = await shopifyConnector.query<QueryResult>(query, {
        first: limit,
      });

      const connection = data[path];
      if (!connection) {
        throw new Error(
          `No data returned for resource: ${config.sourceResource}`
        );
      }

      // Process each row
      for (let i = 0; i < connection.edges.length; i++) {
        const node = connection.edges[i]!.node;

        // Flatten the node (handle nested metafields, etc.)
        const flatSource = this.flattenNode(node, config.sourceResource);

        // Apply mappings
        const targetRow: Record<string, unknown> = {};
        const transformsApplied: string[] = [];
        const rowErrors: string[] = [];

        for (const mapping of config.mappings) {
          if (!mapping.enabled) continue;

          // Get source value
          const sourceValue = this.extractSourceValue(mapping, flatSource);

          // Apply transform
          const transform = mapping.transform || { type: 'direct' as const };
          const { result, applied, error } = applyTransform(
            sourceValue,
            transform,
            flatSource
          );

          targetRow[mapping.target.column] = result;
          transformsApplied.push(`${mapping.target.column}: ${applied}`);

          if (error) {
            rowErrors.push(`${mapping.target.column}: ${error}`);
          }
        }

        sampleRows.push({
          source: flatSource,
          target: targetRow,
          transformsApplied,
          errors: rowErrors,
        });
      }

      // Estimate total count
      totalEstimate = await this.estimateTotalCount(
        shopifyConnector,
        config.sourceResource
      );
    } catch (error) {
      globalErrors.push({
        row: -1,
        message: error instanceof Error ? error.message : 'Preview failed',
      });
    }

    return {
      success: globalErrors.length === 0,
      sampleRows,
      totalEstimate,
      errors: globalErrors,
      summary: {
        rowsFetched: sampleRows.length,
        rowsTransformed: sampleRows.filter((r) => r.errors.length === 0).length,
        rowsWithErrors: sampleRows.filter((r) => r.errors.length > 0).length,
      },
    };
  }

  /**
   * Extract all source fields needed for the mapping.
   */
  private extractSourceFields(config: MappingConfig): string[] {
    const fields: Set<string> = new Set();

    // Add key field if present
    if (config.keyMapping) {
      fields.add(config.keyMapping.sourceField);
    }

    // Add all mapping source fields
    for (const mapping of config.mappings) {
      if (!mapping.enabled) continue;

      if (mapping.source.type === 'single') {
        fields.add(mapping.source.field);
      } else {
        for (const fieldRef of mapping.source.fields) {
          fields.add(fieldRef.field);
        }
      }

      // Add fields used in template transforms
      if (mapping.transform?.type === 'template') {
        const placeholders = mapping.transform.template.match(/\{([^}]+)\}/g);
        if (placeholders) {
          for (const p of placeholders) {
            fields.add(p.slice(1, -1)); // Remove { and }
          }
        }
      }
    }

    return [...fields];
  }

  /**
   * Flatten a Shopify node into a simple key-value object.
   */
  private flattenNode(
    node: Record<string, unknown>,
    _resource: string
  ): Record<string, unknown> {
    const flat: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(node)) {
      // Handle metafield responses (they come back as metafield_namespace_key)
      if (key.startsWith('metafield_')) {
        const parts = key.replace('metafield_', '').split('_');
        const namespace = parts[0];
        const metaKey = parts.slice(1).join('_');
        const metafieldValue = (value as { value?: unknown })?.value;
        flat[`metafields.${namespace}.${metaKey}`] = metafieldValue;
        continue;
      }

      // Handle nested objects
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const nested = value as Record<string, unknown>;
        for (const [nestedKey, nestedValue] of Object.entries(nested)) {
          flat[`${key}.${nestedKey}`] = nestedValue;
        }
        continue;
      }

      flat[key] = value;
    }

    return flat;
  }

  /**
   * Extract source value based on mapping source configuration.
   */
  private extractSourceValue(
    mapping: FieldMapping,
    sourceData: Record<string, unknown>
  ): unknown {
    if (mapping.source.type === 'single') {
      return sourceData[mapping.source.field];
    }

    // Multi-source: create an object with aliases
    const values: Record<string, unknown> = {};
    for (const fieldRef of mapping.source.fields) {
      values[fieldRef.alias] = sourceData[fieldRef.field];
    }
    return values;
  }

  /**
   * Estimate total count for a resource.
   */
  private async estimateTotalCount(
    connector: ShopifyConnector,
    resource: string
  ): Promise<number> {
    try {
      const queryRoots: Record<string, string> = {
        Product: 'products',
        ProductVariant: 'productVariants',
        Collection: 'collections',
        Customer: 'customers',
        Order: 'orders',
        InventoryItem: 'inventoryItems',
      };

      const root = queryRoots[resource];
      if (!root) return 0;

      // Use count query if available, otherwise estimate from first page
      const data = await connector.query<{
        [key: string]: { edges: unknown[]; pageInfo: { hasNextPage: boolean } };
      }>(
        `{ ${root}(first: 1) { edges { node { id } } pageInfo { hasNextPage } } }`
      );

      // If there's no next page, count is small
      const result = data[root];
      if (!result?.pageInfo.hasNextPage) {
        return result?.edges.length || 0;
      }

      // Otherwise, return a placeholder indicating "many"
      return 1000; // Placeholder - would need count query for exact number
    } catch {
      return 0;
    }
  }

  /**
   * Generate a preview using the TransformEngine.
   * This version supports lookups (requires database connection).
   */
  async previewWithEngine(
    config: MappingConfig,
    shopifyConnector: ShopifyConnector,
    dbConnector: DatabaseConnector,
    limit = 5
  ): Promise<PreviewResult> {
    const sampleRows: PreviewRow[] = [];
    const globalErrors: Array<{ row: number; message: string }> = [];
    let totalEstimate = 0;

    try {
      // Initialize transform engine with database connector for lookups
      const engine = new TransformEngine(dbConnector);

      // Get fields needed for preview
      const neededFields = this.extractSourceFields(config);

      // Build and execute query
      const { query, path } = buildSampleQuery(
        config.sourceResource,
        neededFields,
        limit
      );

      type QueryResult = {
        [key: string]: {
          edges: Array<{ node: Record<string, unknown> }>;
          pageInfo: { hasNextPage: boolean };
        };
      };

      const data = await shopifyConnector.query<QueryResult>(query, {
        first: limit,
      });

      const connection = data[path];
      if (!connection) {
        throw new Error(
          `No data returned for resource: ${config.sourceResource}`
        );
      }

      // Convert nodes to ShopifyRecords
      const records: ShopifyRecord[] = connection.edges.map((edge, i) => {
        const flat = this.flattenNode(edge.node, config.sourceResource);
        return {
          id: String(edge.node.id ?? `row-${i}`),
          ...flat,
        };
      });

      // Use TransformEngine for batch processing
      const batchResult = await engine.transformBatch(config, records, {
        dryRun: true,
      });

      // Convert TransformResult to PreviewRow format
      for (let i = 0; i < batchResult.results.length; i++) {
        const result = batchResult.results[i]!;
        const sourceRecord = records[i]!;

        sampleRows.push({
          source: sourceRecord,
          target: result.targetRow,
          transformsApplied: result.appliedTransforms,
          errors: result.errors.map((e) => `${e.field}: ${e.message}`),
        });
      }

      // Estimate total count
      totalEstimate = await this.estimateTotalCount(
        shopifyConnector,
        config.sourceResource
      );
    } catch (error) {
      globalErrors.push({
        row: -1,
        message: error instanceof Error ? error.message : 'Preview failed',
      });
    }

    return {
      success: globalErrors.length === 0,
      sampleRows,
      totalEstimate,
      errors: globalErrors,
      summary: {
        rowsFetched: sampleRows.length,
        rowsTransformed: sampleRows.filter((r) => r.errors.length === 0).length,
        rowsWithErrors: sampleRows.filter((r) => r.errors.length > 0).length,
      },
    };
  }
}

// Singleton instance
let mappingPreviewInstance: MappingPreview | null = null;

export function getMappingPreview(): MappingPreview {
  if (!mappingPreviewInstance) {
    mappingPreviewInstance = new MappingPreview();
  }
  return mappingPreviewInstance;
}
