/**
 * Mapping Validator - Validates mapping configurations against schemas
 *
 * Features:
 * - Validates source fields exist in Shopify schema
 * - Validates target columns exist in database schema
 * - Type compatibility checks with warnings
 * - Transform validation (lookup tables, expressions)
 */

import type {
  MappingConfig,
  FieldMapping,
  Transform,
} from '../types/mapping';
import type {
  DatabaseSchema,
  DatabaseColumn,
  ShopifySchema,
  ShopifyField,
} from '../types';

// ============================================================================
// Validation Result Types
// ============================================================================

export interface ValidationError {
  mappingId: string;
  type:
    | 'source_not_found'
    | 'target_not_found'
    | 'invalid_expression'
    | 'invalid_lookup'
    | 'missing_key_mapping';
  message: string;
  details?: {
    sourceField?: string;
    targetColumn?: string;
    resource?: string;
    table?: string;
  };
}

export interface ValidationWarning {
  mappingId: string;
  type:
    | 'type_mismatch'
    | 'nullable_to_nonnull'
    | 'precision_loss'
    | 'string_truncation';
  message: string;
  suggestedTransform?: Transform;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  stats: {
    totalMappings: number;
    enabledMappings: number;
    validatedMappings: number;
  };
}

// ============================================================================
// Type Compatibility Helpers
// ============================================================================

interface TypeInfo {
  category: 'string' | 'number' | 'boolean' | 'datetime' | 'json' | 'unknown';
  maxLength?: number;
  precision?: number;
  scale?: number;
}

/**
 * Parse a Shopify GraphQL type to TypeInfo
 */
function parseShopifyType(type: string): TypeInfo {
  const lower = type.toLowerCase();

  if (lower.includes('string') || lower === 'id' || lower === 'url') {
    return { category: 'string' };
  }
  if (
    lower.includes('int') ||
    lower.includes('float') ||
    lower === 'money' ||
    lower === 'decimal'
  ) {
    return { category: 'number' };
  }
  if (lower === 'boolean') {
    return { category: 'boolean' };
  }
  if (lower.includes('datetime') || lower.includes('date')) {
    return { category: 'datetime' };
  }
  if (lower === 'json' || lower === 'jsonvalue') {
    return { category: 'json' };
  }
  return { category: 'unknown' };
}

/**
 * Parse a database column type to TypeInfo
 */
function parseDatabaseType(type: string): TypeInfo {
  const lower = type.toLowerCase();

  // String types
  if (
    lower.includes('char') ||
    lower.includes('text') ||
    lower.includes('string')
  ) {
    const match = lower.match(/\((\d+)\)/);
    const maxLength = match ? parseInt(match[1]!, 10) : undefined;
    return { category: 'string', maxLength };
  }

  // Number types
  if (
    lower.includes('int') ||
    lower.includes('bigint') ||
    lower.includes('smallint') ||
    lower.includes('tinyint')
  ) {
    return { category: 'number' };
  }
  if (
    lower.includes('decimal') ||
    lower.includes('numeric') ||
    lower.includes('money')
  ) {
    const match = lower.match(/\((\d+),?\s*(\d+)?\)/);
    return {
      category: 'number',
      precision: match ? parseInt(match[1]!, 10) : undefined,
      scale: match?.[2] ? parseInt(match[2], 10) : undefined,
    };
  }
  if (
    lower.includes('float') ||
    lower.includes('real') ||
    lower.includes('double')
  ) {
    return { category: 'number' };
  }

  // Boolean
  if (lower === 'bit' || lower === 'boolean' || lower === 'bool') {
    return { category: 'boolean' };
  }

  // DateTime
  if (lower.includes('date') || lower.includes('time')) {
    return { category: 'datetime' };
  }

  // JSON
  if (lower === 'json' || lower === 'jsonb' || lower === 'nvarchar(max)') {
    return { category: 'json' };
  }

  return { category: 'unknown' };
}

/**
 * Check if source type is compatible with target type
 */
function checkTypeCompatibility(
  sourceType: TypeInfo,
  targetType: TypeInfo
): { compatible: boolean; warning?: string; suggestedTransform?: Transform } {
  // Same category - generally compatible
  if (sourceType.category === targetType.category) {
    // Check string truncation
    if (
      sourceType.category === 'string' &&
      targetType.maxLength &&
      (!sourceType.maxLength || sourceType.maxLength > targetType.maxLength)
    ) {
      return {
        compatible: true,
        warning: `Source may exceed target max length (${targetType.maxLength})`,
      };
    }
    return { compatible: true };
  }

  // String to anything - usually needs coercion
  if (sourceType.category === 'string' && targetType.category === 'number') {
    return {
      compatible: true,
      warning: 'String to number conversion required',
      suggestedTransform: { type: 'coerce', targetType: 'number' },
    };
  }

  // Number to string - safe
  if (sourceType.category === 'number' && targetType.category === 'string') {
    return { compatible: true };
  }

  // JSON to string - needs serialization
  if (sourceType.category === 'json' && targetType.category === 'string') {
    return {
      compatible: true,
      warning: 'JSON will be serialized to string',
    };
  }

  // DateTime handling
  if (sourceType.category === 'datetime' && targetType.category === 'string') {
    return { compatible: true };
  }
  if (sourceType.category === 'string' && targetType.category === 'datetime') {
    return {
      compatible: true,
      warning: 'String to datetime parsing required',
      suggestedTransform: { type: 'coerce', targetType: 'datetime' },
    };
  }

  // Unknown is always a warning but not an error
  if (sourceType.category === 'unknown' || targetType.category === 'unknown') {
    return {
      compatible: true,
      warning: 'Type compatibility could not be verified',
    };
  }

  return {
    compatible: false,
    warning: `Incompatible types: ${sourceType.category} to ${targetType.category}`,
  };
}

// ============================================================================
// Mapping Validator
// ============================================================================

export class MappingValidator {
  /**
   * Validate a mapping configuration against discovered schemas
   */
  validate(
    config: MappingConfig,
    databaseSchema: DatabaseSchema | null,
    shopifySchema: ShopifySchema | null
  ): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Check if we have schemas to validate against
    if (!databaseSchema) {
      errors.push({
        mappingId: config.id,
        type: 'target_not_found',
        message: 'Database schema not discovered. Cannot validate target columns.',
      });
    }
    if (!shopifySchema) {
      errors.push({
        mappingId: config.id,
        type: 'source_not_found',
        message:
          'Shopify schema not discovered. Cannot validate source fields.',
      });
    }

    // Build lookup maps for faster validation
    const dbTableMap = new Map<string, Map<string, DatabaseColumn>>();
    if (databaseSchema) {
      for (const table of databaseSchema.tables) {
        const fullName = `${table.schema}.${table.name}`;
        const columnMap = new Map<string, DatabaseColumn>();
        for (const col of table.columns) {
          columnMap.set(col.name.toLowerCase(), col);
        }
        dbTableMap.set(fullName.toLowerCase(), columnMap);
        dbTableMap.set(table.name.toLowerCase(), columnMap);
      }
    }

    const shopifyFieldMap = new Map<string, Map<string, ShopifyField>>();
    if (shopifySchema) {
      for (const resource of shopifySchema.resources) {
        const fieldMap = new Map<string, ShopifyField>();
        for (const field of resource.fields) {
          fieldMap.set(field.name.toLowerCase(), field);
        }
        shopifyFieldMap.set(resource.name.toLowerCase(), fieldMap);
      }
    }

    // Validate target table exists
    if (databaseSchema && config.targetTable) {
      const tableColumns = dbTableMap.get(config.targetTable.toLowerCase());
      if (!tableColumns) {
        errors.push({
          mappingId: config.id,
          type: 'target_not_found',
          message: `Target table "${config.targetTable}" not found in database schema`,
          details: { table: config.targetTable },
        });
      }
    }

    // Validate source resource exists
    if (shopifySchema && config.sourceResource) {
      const resourceFields = shopifyFieldMap.get(
        config.sourceResource.toLowerCase()
      );
      if (!resourceFields) {
        errors.push({
          mappingId: config.id,
          type: 'source_not_found',
          message: `Source resource "${config.sourceResource}" not found in Shopify schema`,
          details: { resource: config.sourceResource },
        });
      }
    }

    // Validate key mapping if present
    if (config.keyMapping && databaseSchema && shopifySchema) {
      const tableColumns = dbTableMap.get(config.targetTable.toLowerCase());
      const resourceFields = shopifyFieldMap.get(
        config.sourceResource.toLowerCase()
      );

      if (
        tableColumns &&
        !tableColumns.has(config.keyMapping.targetColumn.toLowerCase())
      ) {
        errors.push({
          mappingId: config.id,
          type: 'target_not_found',
          message: `Key column "${config.keyMapping.targetColumn}" not found in table "${config.targetTable}"`,
          details: {
            targetColumn: config.keyMapping.targetColumn,
            table: config.targetTable,
          },
        });
      }

      if (
        resourceFields &&
        !resourceFields.has(config.keyMapping.sourceField.toLowerCase())
      ) {
        errors.push({
          mappingId: config.id,
          type: 'source_not_found',
          message: `Key field "${config.keyMapping.sourceField}" not found in resource "${config.sourceResource}"`,
          details: {
            sourceField: config.keyMapping.sourceField,
            resource: config.sourceResource,
          },
        });
      }
    }

    // Validate each field mapping
    let validatedCount = 0;
    for (const mapping of config.mappings) {
      if (!mapping.enabled) continue;

      const mappingErrors = this.validateFieldMapping(
        mapping,
        config,
        dbTableMap,
        shopifyFieldMap,
        shopifySchema
      );

      errors.push(...mappingErrors.errors);
      warnings.push(...mappingErrors.warnings);
      validatedCount++;
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      stats: {
        totalMappings: config.mappings.length,
        enabledMappings: config.mappings.filter((m) => m.enabled).length,
        validatedMappings: validatedCount,
      },
    };
  }

  private validateFieldMapping(
    mapping: FieldMapping,
    config: MappingConfig,
    dbTableMap: Map<string, Map<string, DatabaseColumn>>,
    shopifyFieldMap: Map<string, Map<string, ShopifyField>>,
    shopifySchema: ShopifySchema | null
  ): { errors: ValidationError[]; warnings: ValidationWarning[] } {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Validate source
    let sourceType: TypeInfo = { category: 'unknown' };
    if (mapping.source.type === 'single') {
      const resourceFields = shopifyFieldMap.get(
        mapping.source.resource.toLowerCase()
      );
      if (!resourceFields) {
        errors.push({
          mappingId: mapping.id,
          type: 'source_not_found',
          message: `Source resource "${mapping.source.resource}" not found`,
          details: { resource: mapping.source.resource },
        });
      } else {
        // Handle nested fields like "metafields.custom.price"
        const fieldPath = mapping.source.field.split('.');
        const topLevelField = fieldPath[0]!;
        const field = resourceFields.get(topLevelField.toLowerCase());

        if (
          !field &&
          !this.isMetafieldPath(mapping.source.field, shopifySchema)
        ) {
          errors.push({
            mappingId: mapping.id,
            type: 'source_not_found',
            message: `Source field "${mapping.source.field}" not found in resource "${mapping.source.resource}"`,
            details: {
              sourceField: mapping.source.field,
              resource: mapping.source.resource,
            },
          });
        } else if (field) {
          sourceType = parseShopifyType(field.type);
        }
      }
    } else {
      // Multi-source validation
      for (const fieldRef of mapping.source.fields) {
        const resourceFields = shopifyFieldMap.get(
          fieldRef.resource.toLowerCase()
        );
        if (!resourceFields) {
          errors.push({
            mappingId: mapping.id,
            type: 'source_not_found',
            message: `Source resource "${fieldRef.resource}" not found for alias "${fieldRef.alias}"`,
            details: { resource: fieldRef.resource },
          });
        } else if (!resourceFields.has(fieldRef.field.toLowerCase())) {
          errors.push({
            mappingId: mapping.id,
            type: 'source_not_found',
            message: `Source field "${fieldRef.field}" not found in resource "${fieldRef.resource}"`,
            details: {
              sourceField: fieldRef.field,
              resource: fieldRef.resource,
            },
          });
        }
      }
      // Multi-source usually means expression, output type depends on expression
      sourceType = { category: 'unknown' };
    }

    // Validate target
    let targetColumn: DatabaseColumn | undefined;
    const tableColumns =
      dbTableMap.get(mapping.target.table.toLowerCase()) ||
      dbTableMap.get(config.targetTable.toLowerCase());
    if (!tableColumns) {
      errors.push({
        mappingId: mapping.id,
        type: 'target_not_found',
        message: `Target table "${mapping.target.table}" not found`,
        details: { table: mapping.target.table },
      });
    } else {
      targetColumn = tableColumns.get(mapping.target.column.toLowerCase());
      if (!targetColumn) {
        errors.push({
          mappingId: mapping.id,
          type: 'target_not_found',
          message: `Target column "${mapping.target.column}" not found in table "${mapping.target.table}"`,
          details: {
            targetColumn: mapping.target.column,
            table: mapping.target.table,
          },
        });
      }
    }

    // Type compatibility check
    if (
      targetColumn &&
      sourceType.category !== 'unknown' &&
      errors.length === 0
    ) {
      const targetType = parseDatabaseType(targetColumn.type);
      const compatibility = checkTypeCompatibility(sourceType, targetType);

      if (!compatibility.compatible) {
        warnings.push({
          mappingId: mapping.id,
          type: 'type_mismatch',
          message: compatibility.warning || 'Type mismatch',
          suggestedTransform: compatibility.suggestedTransform,
        });
      } else if (compatibility.warning) {
        warnings.push({
          mappingId: mapping.id,
          type: compatibility.suggestedTransform
            ? 'type_mismatch'
            : 'precision_loss',
          message: compatibility.warning,
          suggestedTransform: compatibility.suggestedTransform,
        });
      }

      // Check nullable compatibility
      if (!targetColumn.nullable && mapping.transform?.type !== 'default') {
        warnings.push({
          mappingId: mapping.id,
          type: 'nullable_to_nonnull',
          message: `Target column is not nullable. Consider adding a default value transform.`,
          suggestedTransform: { type: 'default', value: null, onlyIfNull: true },
        });
      }
    }

    // Validate transform if present
    if (mapping.transform) {
      const transformErrors = this.validateTransform(
        mapping.id,
        mapping.transform,
        dbTableMap
      );
      errors.push(...transformErrors);
    }

    return { errors, warnings };
  }

  private validateTransform(
    mappingId: string,
    transform: Transform,
    dbTableMap: Map<string, Map<string, DatabaseColumn>>
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    switch (transform.type) {
      case 'lookup':
        // Validate lookup table exists
        if (!dbTableMap.has(transform.table.toLowerCase())) {
          errors.push({
            mappingId,
            type: 'invalid_lookup',
            message: `Lookup table "${transform.table}" not found`,
            details: { table: transform.table },
          });
        } else {
          const tableColumns = dbTableMap.get(transform.table.toLowerCase())!;
          if (!tableColumns.has(transform.matchColumn.toLowerCase())) {
            errors.push({
              mappingId,
              type: 'invalid_lookup',
              message: `Lookup match column "${transform.matchColumn}" not found in table "${transform.table}"`,
              details: {
                table: transform.table,
                targetColumn: transform.matchColumn,
              },
            });
          }
          if (!tableColumns.has(transform.returnColumn.toLowerCase())) {
            errors.push({
              mappingId,
              type: 'invalid_lookup',
              message: `Lookup return column "${transform.returnColumn}" not found in table "${transform.table}"`,
              details: {
                table: transform.table,
                targetColumn: transform.returnColumn,
              },
            });
          }
        }
        break;

      case 'expression':
        // Basic expression validation - check for obvious syntax errors
        try {
          // Just check if it can be parsed as a function body
          new Function('...args', `return (${transform.formula})`);
        } catch {
          errors.push({
            mappingId,
            type: 'invalid_expression',
            message: `Invalid expression formula: ${transform.formula}`,
          });
        }
        break;

      case 'template':
        // Check template has valid placeholders
        const placeholders = transform.template.match(/\{([^}]+)\}/g);
        if (!placeholders || placeholders.length === 0) {
          errors.push({
            mappingId,
            type: 'invalid_expression',
            message: 'Template has no placeholders. Use {fieldName} syntax.',
          });
        }
        break;
    }

    return errors;
  }

  /**
   * Check if a field path refers to a metafield
   */
  private isMetafieldPath(
    fieldPath: string,
    shopifySchema: ShopifySchema | null
  ): boolean {
    if (!shopifySchema) return false;

    // Check if path starts with "metafields"
    if (!fieldPath.toLowerCase().startsWith('metafields.')) {
      return false;
    }

    // Extract namespace.key from path like "metafields.custom.price"
    const parts = fieldPath.split('.');
    if (parts.length < 3) return false;

    const namespace = parts[1];
    const key = parts[2];

    // Check if this metafield definition exists
    return shopifySchema.metafieldDefinitions.some(
      (def) => def.namespace === namespace && def.key === key
    );
  }
}

// Singleton instance
let mappingValidatorInstance: MappingValidator | null = null;

export function getMappingValidator(): MappingValidator {
  if (!mappingValidatorInstance) {
    mappingValidatorInstance = new MappingValidator();
  }
  return mappingValidatorInstance;
}
