/**
 * Mapping Types - Source-to-target field mapping definitions
 */

// ============================================================================
// Source Types - Where data comes from (Shopify)
// ============================================================================

export interface SingleSource {
  type: 'single';
  resource: string;    // "ProductVariant"
  field: string;       // "sku" or nested "metafields.custom.price"
}

export interface MultiSource {
  type: 'multi';
  fields: Array<{
    resource: string;
    field: string;
    alias: string;     // Variable name used in expression
  }>;
}

export type FieldSource = SingleSource | MultiSource;

// ============================================================================
// Transform Types - How data is modified
// ============================================================================

export interface DirectTransform {
  type: 'direct';
}

export interface CoerceTransform {
  type: 'coerce';
  targetType: string;  // "int", "decimal(10,2)", "varchar(100)", "datetime"
}

export interface ExpressionTransform {
  type: 'expression';
  formula: string;     // "price * 1.13" or "firstName + ' ' + lastName"
}

export interface LookupTransform {
  type: 'lookup';
  table: string;       // Table to look up in
  matchColumn: string; // Column to match against source value
  returnColumn: string; // Column to return
  defaultValue?: unknown; // Value if lookup fails
}

export interface TemplateTransform {
  type: 'template';
  template: string;    // "SKU-{sku}-{color}" with {field} placeholders
}

export interface DefaultTransform {
  type: 'default';
  value: unknown;      // Default value when source is null/undefined
  onlyIfNull: boolean; // If true, only apply when source is null
}

export type Transform =
  | DirectTransform
  | CoerceTransform
  | ExpressionTransform
  | LookupTransform
  | TemplateTransform
  | DefaultTransform;

// ============================================================================
// Field Mapping - A single source-to-target connection
// ============================================================================

export interface FieldMapping {
  id: string;
  source: FieldSource;
  target: {
    table: string;     // "dbo.Sku" or "Sku"
    column: string;    // "Quantity"
  };
  transform?: Transform;
  enabled: boolean;
}

// ============================================================================
// Filter Types - Pre-transform record filtering
// ============================================================================

export type FilterOperator =
  | 'eq'          // equals
  | 'neq'         // not equals
  | 'in'          // value in array
  | 'not_in'      // value not in array
  | 'exists'      // field is not null/undefined
  | 'not_exists'  // field is null/undefined
  | 'gt'          // greater than
  | 'lt'          // less than
  | 'gte'         // greater than or equal
  | 'lte'         // less than or equal
  | 'contains'    // string contains
  | 'starts_with' // string starts with
  | 'regex';      // regex match

export interface MappingFilter {
  field: string;           // "ProductStatus" or "metafields.custom.ws_price"
  operator: FilterOperator;
  value?: unknown;         // Required for most operators, not for exists/not_exists
}

// ============================================================================
// Delete Strategy - How to handle delete webhooks
// ============================================================================

export type DeleteStrategy = 'hard' | 'soft' | 'ignore';

// ============================================================================
// Schedule Config - Automatic sync scheduling
// ============================================================================

export interface ScheduleConfig {
  enabled: boolean;
  type: 'incremental' | 'full';
  pattern: string;        // Cron expression: "*/15 * * * *"
  timezone?: string;      // IANA timezone: "America/Toronto", default "UTC"
  options?: {
    lookbackMinutes?: number;  // For incremental (default: 15)
    deleteStale?: boolean;     // For full sync (default: false)
  };
}

// ============================================================================
// Mapping Config - A named collection of field mappings
// ============================================================================

export interface MappingConfig {
  id: string;
  name: string;
  description?: string;

  // Primary source resource for this mapping
  sourceResource: string;  // "ProductVariant", "Product", etc.

  // Target table
  targetTable: string;     // "dbo.Sku"

  // Key field for matching/upserting
  keyMapping?: {
    sourceField: string;   // "sku"
    targetColumn: string;  // "SkuID"
  };

  // Pre-transform filters - records not matching are skipped
  filters?: MappingFilter[];

  // Individual field mappings
  mappings: FieldMapping[];

  // Webhook configuration
  webhookEnabled?: boolean;        // Auto-process webhooks for this mapping (default: true)
  deleteStrategy?: DeleteStrategy; // How to handle delete webhooks (default: 'hard')
  softDeleteColumn?: string;       // Column for soft delete (e.g., "deletedAt", "isActive")

  // Schedule configuration (stored in SyncSchedule table)
  schedule?: ScheduleConfig;

  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

export function createSingleSource(resource: string, field: string): SingleSource {
  return { type: 'single', resource, field };
}

export function createMultiSource(
  fields: Array<{ resource: string; field: string; alias: string }>
): MultiSource {
  return { type: 'multi', fields };
}
