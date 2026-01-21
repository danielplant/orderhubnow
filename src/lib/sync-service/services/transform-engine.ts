/**
 * Transform Engine - Orchestrates all transforms for batch processing
 *
 * Features:
 * - Streaming support for large batches via async generators
 * - Lookup table pre-loading for batch efficiency
 * - Comprehensive error handling per record
 * - Metrics collection for observability
 *
 * This file consolidates:
 * - TypeCoercer: Type conversion
 * - TemplateEngine: ${var} syntax replacement
 * - ExpressionEvaluator: Safe expression evaluation
 * - LookupResolver: Cached lookup table resolution
 * - TransformEngine: Main orchestrator
 */

import { Parser, Expression } from 'expr-eval';
import type { DatabaseConnector } from '../connectors/database';
import type {
  MappingConfig,
  FieldMapping,
  Transform,
  SingleSource,
  MultiSource,
  LookupTransform,
} from '../types/mapping';

// ============================================================================
// Type Coercer
// ============================================================================

export type CoercionTarget =
  | 'string'
  | 'int'
  | 'float'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'decimal'
  | 'bigint';

export interface CoercionResult {
  success: boolean;
  value: unknown;
  error?: string;
}

export class TypeCoercer {
  coerce(value: unknown, target: CoercionTarget): CoercionResult {
    if (value === null || value === undefined) {
      return { success: true, value: null };
    }

    try {
      switch (target) {
        case 'string':
          return this.toString(value);
        case 'int':
          return this.toInt(value);
        case 'float':
          return this.toFloat(value);
        case 'boolean':
          return this.toBoolean(value);
        case 'date':
          return this.toDate(value);
        case 'datetime':
          return this.toDatetime(value);
        case 'decimal':
          return this.toDecimal(value);
        case 'bigint':
          return this.toBigInt(value);
        default:
          return { success: false, value: null, error: `Unknown target type: ${target}` };
      }
    } catch (err) {
      return {
        success: false,
        value: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private toString(value: unknown): CoercionResult {
    if (typeof value === 'string') return { success: true, value };
    if (typeof value === 'object') return { success: true, value: JSON.stringify(value) };
    return { success: true, value: String(value) };
  }

  private toInt(value: unknown): CoercionResult {
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return { success: false, value: null, error: 'Value is not finite' };
      return { success: true, value: Math.trunc(value) };
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed === '') return { success: true, value: null };
      const parsed = parseInt(trimmed, 10);
      if (Number.isNaN(parsed)) return { success: false, value: null, error: `Cannot parse "${value}" as integer` };
      return { success: true, value: parsed };
    }
    if (typeof value === 'boolean') return { success: true, value: value ? 1 : 0 };
    return { success: false, value: null, error: `Cannot coerce ${typeof value} to int` };
  }

  private toFloat(value: unknown): CoercionResult {
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return { success: false, value: null, error: 'Value is not finite' };
      return { success: true, value };
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed === '') return { success: true, value: null };
      const parsed = parseFloat(trimmed);
      if (Number.isNaN(parsed)) return { success: false, value: null, error: `Cannot parse "${value}" as float` };
      return { success: true, value: parsed };
    }
    if (typeof value === 'boolean') return { success: true, value: value ? 1.0 : 0.0 };
    return { success: false, value: null, error: `Cannot coerce ${typeof value} to float` };
  }

  private toBoolean(value: unknown): CoercionResult {
    if (typeof value === 'boolean') return { success: true, value };
    if (typeof value === 'number') return { success: true, value: value !== 0 };
    if (typeof value === 'string') {
      const lower = value.toLowerCase().trim();
      if (['true', '1', 'yes', 'y', 'on'].includes(lower)) return { success: true, value: true };
      if (['false', '0', 'no', 'n', 'off', ''].includes(lower)) return { success: true, value: false };
      return { success: false, value: null, error: `Cannot parse "${value}" as boolean` };
    }
    return { success: false, value: null, error: `Cannot coerce ${typeof value} to boolean` };
  }

  private toDate(value: unknown): CoercionResult {
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) return { success: false, value: null, error: 'Invalid date' };
      return { success: true, value: value.toISOString().split('T')[0] };
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed === '') return { success: true, value: null };
      const date = new Date(trimmed);
      if (Number.isNaN(date.getTime())) return { success: false, value: null, error: `Cannot parse "${value}" as date` };
      return { success: true, value: date.toISOString().split('T')[0] };
    }
    if (typeof value === 'number') {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return { success: false, value: null, error: 'Invalid timestamp' };
      return { success: true, value: date.toISOString().split('T')[0] };
    }
    return { success: false, value: null, error: `Cannot coerce ${typeof value} to date` };
  }

  private toDatetime(value: unknown): CoercionResult {
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) return { success: false, value: null, error: 'Invalid datetime' };
      return { success: true, value: value.toISOString() };
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed === '') return { success: true, value: null };
      const date = new Date(trimmed);
      if (Number.isNaN(date.getTime())) return { success: false, value: null, error: `Cannot parse "${value}" as datetime` };
      return { success: true, value: date.toISOString() };
    }
    if (typeof value === 'number') {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return { success: false, value: null, error: 'Invalid timestamp' };
      return { success: true, value: date.toISOString() };
    }
    return { success: false, value: null, error: `Cannot coerce ${typeof value} to datetime` };
  }

  private toDecimal(value: unknown): CoercionResult {
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return { success: false, value: null, error: 'Value is not finite' };
      return { success: true, value: value.toString() };
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed === '') return { success: true, value: null };
      if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return { success: false, value: null, error: `Cannot parse "${value}" as decimal` };
      return { success: true, value: trimmed };
    }
    return { success: false, value: null, error: `Cannot coerce ${typeof value} to decimal` };
  }

  private toBigInt(value: unknown): CoercionResult {
    if (typeof value === 'bigint') return { success: true, value: value.toString() };
    if (typeof value === 'number') {
      if (!Number.isFinite(value) || !Number.isInteger(value)) return { success: false, value: null, error: 'Value must be a finite integer' };
      return { success: true, value: value.toString() };
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed === '') return { success: true, value: null };
      const gidMatch = trimmed.match(/\/(\d+)$/);
      if (gidMatch) return { success: true, value: gidMatch[1] };
      if (!/^-?\d+$/.test(trimmed)) return { success: false, value: null, error: `Cannot parse "${value}" as bigint` };
      return { success: true, value: trimmed };
    }
    return { success: false, value: null, error: `Cannot coerce ${typeof value} to bigint` };
  }
}

// ============================================================================
// Template Engine
// ============================================================================

export interface TemplateResult {
  success: boolean;
  value: string;
  missingVars: string[];
  error?: string;
}

export class TemplateEngine {
  private readonly templateRegex = /\$\{([^}]+)\}/g;

  apply(template: string, context: Record<string, unknown>): TemplateResult {
    const missingVars: string[] = [];

    try {
      const result = template.replace(this.templateRegex, (match, path: string) => {
        const trimmedPath = path.trim();
        const value = this.getNestedValue(context, trimmedPath);

        if (value === undefined) {
          missingVars.push(trimmedPath);
          return '';
        }

        if (value === null) return '';
        return String(value);
      });

      return { success: true, value: result, missingVars };
    } catch (err) {
      return {
        success: false,
        value: '',
        missingVars,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      if (typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }
}

// ============================================================================
// Expression Evaluator
// ============================================================================

export interface CompiledExpression {
  expression: Expression;
  variables: string[];
  formula: string;
}

export interface EvaluationResult {
  success: boolean;
  value: unknown;
  error?: string;
}

export class ExpressionEvaluator {
  private parser: Parser;
  private maxLength: number;

  constructor(maxLength: number = 500) {
    this.maxLength = maxLength;
    this.parser = new Parser({
      operators: {
        logical: true,
        comparison: true,
        concatenate: true,
        conditional: true,
        add: true,
        multiply: true,
        divide: true,
        factorial: false,
        power: true,
        remainder: true,
        in: false,
        assignment: false,
      },
    });

    this.registerCustomFunctions();
  }

  private registerCustomFunctions(): void {
    this.parser.functions.toUpperCase = (s: unknown) => s != null ? String(s).toUpperCase() : '';
    this.parser.functions.toLowerCase = (s: unknown) => s != null ? String(s).toLowerCase() : '';
    this.parser.functions.trim = (s: unknown) => s != null ? String(s).trim() : '';
    this.parser.functions.substring = (s: unknown, start: number, length?: number) => {
      if (s == null) return '';
      const str = String(s);
      if (length !== undefined) return str.substring(start, start + length);
      return str.substring(start);
    };
    this.parser.functions.length = (s: unknown) => s != null ? String(s).length : 0;
    this.parser.functions.replace = (s: unknown, search: string, replacement: string) =>
      s != null ? String(s).replace(search, replacement) : '';
    this.parser.functions.split = (s: unknown, delimiter: string, index: number) => {
      if (s == null) return '';
      const parts = String(s).split(delimiter);
      return parts[index] ?? '';
    };
    this.parser.functions.startsWith = (s: unknown, prefix: string) => s != null ? String(s).startsWith(prefix) : false;
    this.parser.functions.endsWith = (s: unknown, suffix: string) => s != null ? String(s).endsWith(suffix) : false;
    this.parser.functions.contains = (s: unknown, search: string) => s != null ? String(s).includes(search) : false;
    this.parser.functions.parseNumber = (s: unknown) => {
      if (s == null) return 0;
      const parsed = parseFloat(String(s));
      return Number.isNaN(parsed) ? 0 : parsed;
    };
    this.parser.functions.parseInt = (s: unknown) => {
      if (s == null) return 0;
      const parsed = parseInt(String(s), 10);
      return Number.isNaN(parsed) ? 0 : parsed;
    };
    this.parser.functions.round = (n: number, decimals?: number) => {
      if (decimals === undefined) return Math.round(n);
      const factor = Math.pow(10, decimals);
      return Math.round(n * factor) / factor;
    };
    this.parser.functions.floor = (n: number) => Math.floor(n);
    this.parser.functions.ceil = (n: number) => Math.ceil(n);
    this.parser.functions.abs = (n: number) => Math.abs(n);
    this.parser.functions.min = Math.min;
    this.parser.functions.max = Math.max;
    this.parser.functions.parseUnits = (sku: unknown) => {
      if (sku == null) return 1;
      const str = String(sku).toUpperCase();
      const match = str.match(/^(\d+)PC-/);
      return match && match[1] ? parseInt(match[1], 10) : 1;
    };
    this.parser.functions.ifNull = (value: unknown, defaultValue: unknown) => value == null ? defaultValue : value;
    this.parser.functions.ifEmpty = (value: unknown, defaultValue: unknown) => {
      if (value == null) return defaultValue;
      if (typeof value === 'string' && value.trim() === '') return defaultValue;
      return value;
    };
    this.parser.functions.coalesce = (...args: unknown[]) => {
      for (const arg of args) {
        if (arg != null) return arg;
      }
      return null;
    };
    this.parser.functions.isNull = (value: unknown) => value == null;
    this.parser.functions.isNumber = (value: unknown) => typeof value === 'number' && Number.isFinite(value);
    this.parser.functions.isString = (value: unknown) => typeof value === 'string';
  }

  compile(formula: string): CompiledExpression {
    if (formula.length > this.maxLength) {
      throw new Error(`Expression exceeds maximum length of ${this.maxLength} characters`);
    }

    try {
      const expression = this.parser.parse(formula);
      const variables = expression.variables();
      return { expression, variables, formula };
    } catch (err) {
      throw new Error(`Failed to compile expression: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  evaluate(compiled: CompiledExpression, context: Record<string, unknown>): EvaluationResult {
    try {
      const evalContext: Record<string, unknown> = {};

      for (const varName of compiled.variables) {
        const value = this.getNestedValue(context, varName);
        evalContext[varName] = value ?? null;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const value = compiled.expression.evaluate(evalContext as any);
      return { success: true, value };
    } catch (err) {
      return {
        success: false,
        value: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  evaluateFormula(formula: string, context: Record<string, unknown>): EvaluationResult {
    try {
      const compiled = this.compile(formula);
      return this.evaluate(compiled, context);
    } catch (err) {
      return {
        success: false,
        value: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    if (path in obj) return obj[path];

    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      if (typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }
}

// ============================================================================
// Lookup Resolver
// ============================================================================

export interface LookupRequirement {
  table: string;
  matchColumn: string;
  returnColumn: string;
  caseSensitive: boolean;
}

export interface LookupCache {
  tables: Map<string, LookupTable>;
  stats: LookupStats;
}

export interface LookupTable {
  table: string;
  matchColumn: string;
  returnColumn: string;
  data: Map<string, unknown>;
  rowCount: number;
}

export interface LookupStats {
  tablesLoaded: number;
  totalRows: number;
  loadTimeMs: number;
  warnings: string[];
}

export class LookupResolver {
  private maxTableSize: number;
  private caseSensitive: boolean;

  constructor(
    private dbConnector: DatabaseConnector,
    maxTableSize: number = 10000,
    caseSensitive: boolean = false
  ) {
    this.maxTableSize = maxTableSize;
    this.caseSensitive = caseSensitive;
  }

  extractLookupRequirements(config: MappingConfig): LookupRequirement[] {
    const requirements: LookupRequirement[] = [];
    const seen = new Set<string>();

    for (const mapping of config.mappings) {
      if (mapping.transform?.type === 'lookup') {
        const lookup = mapping.transform as LookupTransform;
        const key = `${lookup.table}|${lookup.matchColumn}|${lookup.returnColumn}`;

        if (!seen.has(key)) {
          seen.add(key);
          requirements.push({
            table: lookup.table,
            matchColumn: lookup.matchColumn,
            returnColumn: lookup.returnColumn,
            caseSensitive: this.caseSensitive,
          });
        }
      }
    }

    return requirements;
  }

  async preload(requirements: LookupRequirement[]): Promise<LookupCache> {
    const startTime = Date.now();
    const tables = new Map<string, LookupTable>();
    const warnings: string[] = [];
    let totalRows = 0;

    for (const req of requirements) {
      try {
        const countQuery = `SELECT COUNT(*) as cnt FROM ${req.table}`;
        const countResult = await this.dbConnector.query<{ cnt: number }>(countQuery);
        const rowCount = countResult[0]?.cnt ?? 0;

        if (rowCount > this.maxTableSize) {
          warnings.push(
            `Lookup table ${req.table} has ${rowCount} rows (limit: ${this.maxTableSize}).`
          );
        }

        const query = `SELECT ${req.matchColumn}, ${req.returnColumn} FROM ${req.table}`;
        const rows = await this.dbConnector.query<Record<string, unknown>>(query);

        const data = new Map<string, unknown>();
        for (const row of rows) {
          let matchValue = row[req.matchColumn];
          const returnValue = row[req.returnColumn];

          if (!this.caseSensitive && typeof matchValue === 'string') {
            matchValue = matchValue.toLowerCase();
          }

          if (matchValue != null) {
            data.set(String(matchValue), returnValue);
          }
        }

        const tableKey = this.getTableKey(req);
        tables.set(tableKey, {
          table: req.table,
          matchColumn: req.matchColumn,
          returnColumn: req.returnColumn,
          data,
          rowCount: rows.length,
        });

        totalRows += rows.length;
      } catch (err) {
        warnings.push(
          `Failed to load lookup table ${req.table}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    return {
      tables,
      stats: {
        tablesLoaded: tables.size,
        totalRows,
        loadTimeMs: Date.now() - startTime,
        warnings,
      },
    };
  }

  resolve(
    cache: LookupCache,
    table: string,
    matchColumn: string,
    returnColumn: string,
    matchValue: unknown,
    defaultValue?: unknown
  ): { found: boolean; value: unknown } {
    const tableKey = this.getTableKey({ table, matchColumn, returnColumn });
    const lookupTable = cache.tables.get(tableKey);

    if (!lookupTable) return { found: false, value: defaultValue ?? null };
    if (matchValue == null) return { found: false, value: defaultValue ?? null };

    let key = String(matchValue);
    if (!this.caseSensitive) key = key.toLowerCase();

    const value = lookupTable.data.get(key);
    if (value === undefined) return { found: false, value: defaultValue ?? null };

    return { found: true, value };
  }

  private getTableKey(req: { table: string; matchColumn: string; returnColumn: string }): string {
    return `${req.table}|${req.matchColumn}|${req.returnColumn}`;
  }

  clearCache(cache: LookupCache): void {
    for (const table of cache.tables.values()) {
      table.data.clear();
    }
    cache.tables.clear();
  }
}

// ============================================================================
// Transform Engine Types
// ============================================================================

export interface ShopifyRecord {
  id: string;
  [key: string]: unknown;
}

export interface TransformOptions {
  dryRun: boolean;
  chunkSize?: number;
  onProgress?: (processed: number, total?: number) => void;
}

export interface TransformResult {
  sourceId: string;
  status: 'success' | 'partial' | 'error';
  targetRow: Record<string, unknown>;
  appliedTransforms: string[];
  errors: TransformError[];
  warnings: TransformWarning[];
  metrics: TransformMetrics;
}

export interface TransformError {
  field: string;
  transform: string;
  message: string;
  sourceValue: unknown;
}

export interface TransformWarning {
  field: string;
  message: string;
}

export interface TransformMetrics {
  transformTimeMs: number;
  lookupsPerformed: number;
  expressionsEvaluated: number;
}

export interface TransformContext {
  sourceRecord: ShopifyRecord;
  aliases: Record<string, unknown>;
  lookupCache: LookupCache;
  mappingConfig: MappingConfig;
  compiledExpressions: Map<string, CompiledExpression>;
}

export interface BatchResult {
  results: TransformResult[];
  summary: {
    total: number;
    successful: number;
    partial: number;
    failed: number;
    totalTimeMs: number;
    avgTimePerRecordMs: number;
  };
  lookupStats: LookupStats;
}

// ============================================================================
// Transform Engine
// ============================================================================

export class TransformEngine {
  private typeCoercer: TypeCoercer;
  private templateEngine: TemplateEngine;
  private expressionEvaluator: ExpressionEvaluator;
  private lookupResolver: LookupResolver;

  constructor(dbConnector: DatabaseConnector) {
    this.typeCoercer = new TypeCoercer();
    this.templateEngine = new TemplateEngine();
    this.expressionEvaluator = new ExpressionEvaluator();
    this.lookupResolver = new LookupResolver(dbConnector);
  }

  async *transformBatchStream(
    config: MappingConfig,
    sourceRecords: AsyncIterable<ShopifyRecord>,
    options: TransformOptions
  ): AsyncGenerator<TransformResult> {
    const lookupRequirements = this.lookupResolver.extractLookupRequirements(config);
    const lookupCache = await this.lookupResolver.preload(lookupRequirements);
    const compiledExpressions = this.precompileExpressions(config);

    let processed = 0;

    try {
      for await (const record of sourceRecords) {
        const result = this.transformRecord(record, config, lookupCache, compiledExpressions);
        processed++;

        if (options.onProgress) {
          options.onProgress(processed);
        }

        yield result;
      }
    } finally {
      this.lookupResolver.clearCache(lookupCache);
    }
  }

  async transformBatch(
    config: MappingConfig,
    sourceRecords: ShopifyRecord[],
    options: TransformOptions
  ): Promise<BatchResult> {
    const startTime = Date.now();

    const lookupRequirements = this.lookupResolver.extractLookupRequirements(config);
    const lookupCache = await this.lookupResolver.preload(lookupRequirements);
    const compiledExpressions = this.precompileExpressions(config);

    const results: TransformResult[] = [];
    let successful = 0;
    let partial = 0;
    let failed = 0;

    try {
      for (let i = 0; i < sourceRecords.length; i++) {
        const record = sourceRecords[i]!;
        const result = this.transformRecord(record, config, lookupCache, compiledExpressions);
        results.push(result);

        switch (result.status) {
          case 'success':
            successful++;
            break;
          case 'partial':
            partial++;
            break;
          case 'error':
            failed++;
            break;
        }

        if (options.onProgress) {
          options.onProgress(i + 1, sourceRecords.length);
        }
      }
    } finally {
      this.lookupResolver.clearCache(lookupCache);
    }

    const totalTimeMs = Date.now() - startTime;

    return {
      results,
      summary: {
        total: sourceRecords.length,
        successful,
        partial,
        failed,
        totalTimeMs,
        avgTimePerRecordMs: sourceRecords.length > 0 ? totalTimeMs / sourceRecords.length : 0,
      },
      lookupStats: lookupCache.stats,
    };
  }

  transformRecord(
    record: ShopifyRecord,
    config: MappingConfig,
    lookupCache: LookupCache,
    compiledExpressions: Map<string, CompiledExpression>
  ): TransformResult {
    const startTime = Date.now();
    const targetRow: Record<string, unknown> = {};
    const appliedTransforms: string[] = [];
    const errors: TransformError[] = [];
    const warnings: TransformWarning[] = [];
    let lookupsPerformed = 0;
    let expressionsEvaluated = 0;

    for (const mapping of config.mappings) {
      if (!mapping.enabled) continue;

      try {
        const { value, aliases } = this.getSourceValue(mapping, record);

        const context: TransformContext = {
          sourceRecord: record,
          aliases,
          lookupCache,
          mappingConfig: config,
          compiledExpressions,
        };

        const transform = mapping.transform ?? { type: 'direct' as const };
        const transformResult = this.applyTransform(transform, value, context, mapping.id);

        if (transformResult.error) {
          errors.push({
            field: mapping.target.column,
            transform: transform.type,
            message: transformResult.error,
            sourceValue: value,
          });
        } else {
          targetRow[mapping.target.column] = transformResult.value;
          appliedTransforms.push(`${mapping.target.column}: ${transformResult.applied}`);
        }

        if (transform.type === 'lookup') lookupsPerformed++;
        if (transform.type === 'expression') expressionsEvaluated++;

        if (transformResult.warning) {
          warnings.push({
            field: mapping.target.column,
            message: transformResult.warning,
          });
        }
      } catch (err) {
        errors.push({
          field: mapping.target.column,
          transform: mapping.transform?.type ?? 'direct',
          message: err instanceof Error ? err.message : String(err),
          sourceValue: null,
        });
      }
    }

    let status: 'success' | 'partial' | 'error';
    if (errors.length === 0) {
      status = 'success';
    } else if (Object.keys(targetRow).length > 0) {
      status = 'partial';
    } else {
      status = 'error';
    }

    return {
      sourceId: record.id,
      status,
      targetRow,
      appliedTransforms,
      errors,
      warnings,
      metrics: {
        transformTimeMs: Date.now() - startTime,
        lookupsPerformed,
        expressionsEvaluated,
      },
    };
  }

  private getSourceValue(
    mapping: FieldMapping,
    record: ShopifyRecord
  ): { value: unknown; aliases: Record<string, unknown> } {
    if (mapping.source.type === 'single') {
      const source = mapping.source as SingleSource;
      const value = this.getNestedValue(record, source.field);
      return { value, aliases: {} };
    }

    const multiSource = mapping.source as MultiSource;
    const aliases: Record<string, unknown> = {};
    let primaryValue: unknown = null;

    for (const field of multiSource.fields) {
      const value = this.getNestedValue(record, field.field);
      aliases[field.alias] = value;
      if (primaryValue === null) {
        primaryValue = value;
      }
    }

    return { value: primaryValue, aliases };
  }

  private applyTransform(
    transform: Transform,
    value: unknown,
    context: TransformContext,
    mappingId: string
  ): { value: unknown; applied: string; error?: string; warning?: string } {
    switch (transform.type) {
      case 'direct':
        return { value, applied: 'direct' };

      case 'coerce':
        const coerceResult = this.typeCoercer.coerce(value, transform.targetType as CoercionTarget);
        if (!coerceResult.success) {
          return { value: null, applied: 'coerce', error: coerceResult.error };
        }
        return { value: coerceResult.value, applied: `coerce(${transform.targetType})` };

      case 'expression':
        const exprContext = this.buildExpressionContext(context);
        const compiled = context.compiledExpressions.get(mappingId);
        const evalResult = compiled
          ? this.expressionEvaluator.evaluate(compiled, exprContext)
          : this.expressionEvaluator.evaluateFormula(transform.formula, exprContext);

        if (!evalResult.success) {
          return { value: null, applied: 'expression', error: evalResult.error };
        }
        return { value: evalResult.value, applied: `expression(${transform.formula})` };

      case 'lookup':
        const lookupResult = this.lookupResolver.resolve(
          context.lookupCache,
          transform.table,
          transform.matchColumn,
          transform.returnColumn,
          value,
          transform.defaultValue
        );

        const warning = !lookupResult.found && transform.defaultValue === undefined
          ? `Lookup not found for value: ${value}`
          : undefined;

        return {
          value: lookupResult.value,
          applied: `lookup(${transform.table}.${transform.returnColumn})`,
          warning,
        };

      case 'template':
        const templateContext = this.buildExpressionContext(context);
        const templateResult = this.templateEngine.apply(transform.template, templateContext);

        if (!templateResult.success) {
          return { value: null, applied: 'template', error: templateResult.error };
        }

        const templateWarning = templateResult.missingVars.length > 0
          ? `Missing template variables: ${templateResult.missingVars.join(', ')}`
          : undefined;

        return {
          value: templateResult.value,
          applied: `template(${transform.template})`,
          warning: templateWarning,
        };

      case 'default':
        if (value == null || (transform.onlyIfNull === false)) {
          return { value: transform.value, applied: `default(${transform.value})` };
        }
        return { value, applied: 'default (not applied)' };

      default:
        return { value, applied: 'unknown', error: `Unknown transform type: ${(transform as Transform).type}` };
    }
  }

  private buildExpressionContext(context: TransformContext): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    this.flattenObject(context.sourceRecord, result, '');

    for (const [key, value] of Object.entries(context.aliases)) {
      result[key] = value;
    }

    return result;
  }

  private flattenObject(
    obj: Record<string, unknown>,
    result: Record<string, unknown>,
    prefix: string
  ): void {
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;

      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        this.flattenObject(value as Record<string, unknown>, result, fullKey);
      } else {
        result[fullKey] = value;
      }
    }
  }

  private precompileExpressions(config: MappingConfig): Map<string, CompiledExpression> {
    const compiled = new Map<string, CompiledExpression>();

    for (const mapping of config.mappings) {
      if (mapping.transform?.type === 'expression') {
        try {
          const expr = this.expressionEvaluator.compile(mapping.transform.formula);
          compiled.set(mapping.id, expr);
        } catch (err) {
          console.warn(`Failed to pre-compile expression for mapping ${mapping.id}: ${err}`);
        }
      }
    }

    return compiled;
  }

  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      if (typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }
}
