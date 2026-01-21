/**
 * Database Writer - Handles upserts and batch inserts with DB-specific SQL
 *
 * Features:
 * - Database-specific upsert (MERGE/ON CONFLICT/ON DUPLICATE KEY)
 * - Chunked batch inserts for performance
 * - Transaction management per chunk
 * - Stale record cleanup
 */

import type { DatabaseConnector } from '../types/database';

// ============================================================================
// Types
// ============================================================================

export interface UpsertOptions {
  table: string;
  keyColumn: string;
  rows: Record<string, unknown>[];
  chunkSize?: number; // Default 100
  onConflict: 'update' | 'skip' | 'error';
}

export interface WriteResult {
  inserted: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; error: string }>;
}

export interface BatchInsertOptions {
  table: string;
  rows: Record<string, unknown>[];
  chunkSize?: number;
}

// ============================================================================
// DatabaseWriter Class
// ============================================================================

export class DatabaseWriter {
  private connector: DatabaseConnector;

  constructor(connector: DatabaseConnector) {
    this.connector = connector;
  }

  // ==========================================================================
  // Upsert
  // ==========================================================================

  /**
   * Upsert rows with database-specific SQL.
   * Processes in chunks for memory efficiency.
   */
  async upsert(options: UpsertOptions): Promise<WriteResult> {
    const { table, keyColumn, rows, onConflict } = options;
    const chunkSize = options.chunkSize ?? 100;

    const result: WriteResult = {
      inserted: 0,
      updated: 0,
      skipped: 0,
      errors: [],
    };

    if (rows.length === 0) {
      return result;
    }

    // Get columns from first row
    const firstRow = rows[0];
    if (!firstRow) {
      return result;
    }
    const columns = Object.keys(firstRow);
    if (!columns.includes(keyColumn)) {
      throw new Error(`Key column '${keyColumn}' not found in row data`);
    }

    // Process in chunks
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);

      try {
        const chunkResult = await this.upsertChunk(
          table,
          keyColumn,
          columns,
          chunk,
          onConflict
        );

        result.inserted += chunkResult.inserted;
        result.updated += chunkResult.updated;
        result.skipped += chunkResult.skipped;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);

        // Record error for each row in failed chunk
        for (let j = 0; j < chunk.length; j++) {
          result.errors.push({
            row: i + j,
            error: errorMessage,
          });
        }
      }
    }

    return result;
  }

  /**
   * Upsert a single chunk of rows.
   */
  private async upsertChunk(
    table: string,
    keyColumn: string,
    columns: string[],
    rows: Record<string, unknown>[],
    onConflict: 'update' | 'skip' | 'error'
  ): Promise<{ inserted: number; updated: number; skipped: number }> {
    switch (this.connector.type) {
      case 'sqlserver':
        return this.upsertSqlServer(table, keyColumn, columns, rows, onConflict);
      case 'postgresql':
        return this.upsertPostgres(table, keyColumn, columns, rows, onConflict);
      case 'mysql':
        return this.upsertMySql(table, keyColumn, columns, rows, onConflict);
      default:
        throw new Error(`Unsupported database type: ${this.connector.type}`);
    }
  }

  /**
   * SQL Server upsert using MERGE statement.
   */
  private async upsertSqlServer(
    table: string,
    keyColumn: string,
    columns: string[],
    rows: Record<string, unknown>[],
    onConflict: 'update' | 'skip' | 'error'
  ): Promise<{ inserted: number; updated: number; skipped: number }> {
    // Build VALUES clause
    const valueRows = rows
      .map((row) => {
        const values = columns.map((col) => this.formatValue(row[col]));
        return `(${values.join(', ')})`;
      })
      .join(',\n      ');

    // Build column list
    const columnList = columns.map((c) => `[${c}]`).join(', ');
    const sourceColumns = columns.map((c) => `source.[${c}]`).join(', ');

    // Build update SET clause (exclude key column)
    const updateColumns = columns.filter((c) => c !== keyColumn);
    const updateSet = updateColumns
      .map((c) => `target.[${c}] = source.[${c}]`)
      .join(', ');

    let sql: string;

    if (onConflict === 'error') {
      // Simple INSERT - will fail on duplicate
      sql = `
        INSERT INTO ${table} (${columnList})
        VALUES ${valueRows}
      `;
    } else {
      // MERGE for upsert
      sql = `
        MERGE INTO ${table} AS target
        USING (VALUES
          ${valueRows}
        ) AS source (${columnList})
        ON target.[${keyColumn}] = source.[${keyColumn}]
        ${
          onConflict === 'update' && updateSet
            ? `WHEN MATCHED THEN UPDATE SET ${updateSet}`
            : ''
        }
        WHEN NOT MATCHED THEN INSERT (${columnList}) VALUES (${sourceColumns})
        OUTPUT $action AS action;
      `;
    }

    const results = await this.connector.query<{ action: string }>(sql);

    let inserted = 0;
    let updated = 0;

    for (const row of results) {
      if (row.action === 'INSERT') inserted++;
      else if (row.action === 'UPDATE') updated++;
    }

    return {
      inserted,
      updated,
      skipped: rows.length - inserted - updated,
    };
  }

  /**
   * PostgreSQL upsert using ON CONFLICT.
   */
  private async upsertPostgres(
    table: string,
    keyColumn: string,
    columns: string[],
    rows: Record<string, unknown>[],
    onConflict: 'update' | 'skip' | 'error'
  ): Promise<{ inserted: number; updated: number; skipped: number }> {
    // Build VALUES clause
    const valueRows = rows
      .map((row) => {
        const values = columns.map((col) => this.formatValue(row[col]));
        return `(${values.join(', ')})`;
      })
      .join(',\n      ');

    // Build column list
    const columnList = columns.map((c) => `"${c}"`).join(', ');

    // Build update SET clause
    const updateColumns = columns.filter((c) => c !== keyColumn);
    const updateSet = updateColumns
      .map((c) => `"${c}" = EXCLUDED."${c}"`)
      .join(', ');

    let conflictClause: string;

    if (onConflict === 'error') {
      conflictClause = '';
    } else if (onConflict === 'skip') {
      conflictClause = `ON CONFLICT ("${keyColumn}") DO NOTHING`;
    } else {
      conflictClause = updateSet
        ? `ON CONFLICT ("${keyColumn}") DO UPDATE SET ${updateSet}`
        : `ON CONFLICT ("${keyColumn}") DO NOTHING`;
    }

    const sql = `
      INSERT INTO ${table} (${columnList})
      VALUES ${valueRows}
      ${conflictClause}
      RETURNING (xmax = 0) AS inserted
    `;

    const results = await this.connector.query<{ inserted: boolean }>(sql);

    let inserted = 0;
    let updated = 0;

    for (const row of results) {
      if (row.inserted) inserted++;
      else updated++;
    }

    const skipped = rows.length - results.length;

    return { inserted, updated, skipped };
  }

  /**
   * MySQL upsert using ON DUPLICATE KEY UPDATE.
   */
  private async upsertMySql(
    table: string,
    keyColumn: string,
    columns: string[],
    rows: Record<string, unknown>[],
    onConflict: 'update' | 'skip' | 'error'
  ): Promise<{ inserted: number; updated: number; skipped: number }> {
    // Build VALUES clause
    const valueRows = rows
      .map((row) => {
        const values = columns.map((col) => this.formatValue(row[col]));
        return `(${values.join(', ')})`;
      })
      .join(',\n      ');

    // Build column list
    const columnList = columns.map((c) => `\`${c}\``).join(', ');

    // Build update SET clause
    const updateColumns = columns.filter((c) => c !== keyColumn);
    const updateSet = updateColumns
      .map((c) => `\`${c}\` = VALUES(\`${c}\`)`)
      .join(', ');

    let sql: string;

    if (onConflict === 'error') {
      sql = `
        INSERT INTO ${table} (${columnList})
        VALUES ${valueRows}
      `;
    } else if (onConflict === 'skip') {
      sql = `
        INSERT IGNORE INTO ${table} (${columnList})
        VALUES ${valueRows}
      `;
    } else {
      sql = updateSet
        ? `
          INSERT INTO ${table} (${columnList})
          VALUES ${valueRows}
          ON DUPLICATE KEY UPDATE ${updateSet}
        `
        : `
          INSERT IGNORE INTO ${table} (${columnList})
          VALUES ${valueRows}
        `;
    }

    // MySQL doesn't easily return inserted vs updated counts
    await this.connector.query(sql);

    // For simplicity, assume all succeeded (errors would throw)
    return {
      inserted: rows.length,
      updated: 0,
      skipped: 0,
    };
  }

  // ==========================================================================
  // Batch Insert (no conflict handling)
  // ==========================================================================

  /**
   * Insert rows without conflict handling.
   */
  async batchInsert(options: BatchInsertOptions): Promise<WriteResult> {
    const { table, rows } = options;
    const chunkSize = options.chunkSize ?? 100;

    const result: WriteResult = {
      inserted: 0,
      updated: 0,
      skipped: 0,
      errors: [],
    };

    if (rows.length === 0) {
      return result;
    }

    const firstRow = rows[0];
    if (!firstRow) {
      return result;
    }
    const columns = Object.keys(firstRow);

    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);

      try {
        await this.insertChunk(table, columns, chunk);
        result.inserted += chunk.length;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);

        for (let j = 0; j < chunk.length; j++) {
          result.errors.push({
            row: i + j,
            error: errorMessage,
          });
        }
      }
    }

    return result;
  }

  /**
   * Insert a chunk of rows.
   */
  private async insertChunk(
    table: string,
    columns: string[],
    rows: Record<string, unknown>[]
  ): Promise<void> {
    const valueRows = rows
      .map((row) => {
        const values = columns.map((col) => this.formatValue(row[col]));
        return `(${values.join(', ')})`;
      })
      .join(',\n      ');

    let columnList: string;

    switch (this.connector.type) {
      case 'sqlserver':
        columnList = columns.map((c) => `[${c}]`).join(', ');
        break;
      case 'postgresql':
        columnList = columns.map((c) => `"${c}"`).join(', ');
        break;
      case 'mysql':
        columnList = columns.map((c) => `\`${c}\``).join(', ');
        break;
      default:
        columnList = columns.join(', ');
    }

    const sql = `INSERT INTO ${table} (${columnList}) VALUES ${valueRows}`;
    await this.connector.query(sql);
  }

  // ==========================================================================
  // Stale Record Cleanup
  // ==========================================================================

  /**
   * Delete records that are not in the valid keys set.
   * Used after full sync to remove stale data.
   */
  async deleteStale(
    table: string,
    keyColumn: string,
    validKeys: Set<string>
  ): Promise<number> {
    if (validKeys.size === 0) {
      // Don't delete everything if no valid keys
      console.warn(
        '[DatabaseWriter] deleteStale called with empty validKeys set - skipping'
      );
      return 0;
    }

    // For large sets, this could be memory-intensive
    const keyList = Array.from(validKeys)
      .map((k) => this.formatValue(k))
      .join(', ');

    let keyColumnQuoted: string;

    switch (this.connector.type) {
      case 'sqlserver':
        keyColumnQuoted = `[${keyColumn}]`;
        break;
      case 'postgresql':
        keyColumnQuoted = `"${keyColumn}"`;
        break;
      case 'mysql':
        keyColumnQuoted = `\`${keyColumn}\``;
        break;
      default:
        keyColumnQuoted = keyColumn;
    }

    const sql = `DELETE FROM ${table} WHERE ${keyColumnQuoted} NOT IN (${keyList})`;
    await this.connector.query(sql);

    return 0;
  }

  // ==========================================================================
  // Single Record Operations (for webhooks)
  // ==========================================================================

  /**
   * Delete a single record by key value.
   */
  async deleteByKey(
    table: string,
    keyColumn: string,
    keyValue: unknown
  ): Promise<boolean> {
    const keyColumnQuoted = this.quoteIdentifier(keyColumn);
    const keyValueFormatted = this.formatValue(keyValue);

    const sql = `DELETE FROM ${table} WHERE ${keyColumnQuoted} = ${keyValueFormatted}`;

    await this.connector.query(sql);
    return true;
  }

  /**
   * Update a single record by key value.
   */
  async updateByKey(
    table: string,
    keyColumn: string,
    keyValue: unknown,
    updates: Record<string, unknown>
  ): Promise<boolean> {
    const keyColumnQuoted = this.quoteIdentifier(keyColumn);
    const keyValueFormatted = this.formatValue(keyValue);

    const setClauses = Object.entries(updates)
      .map(
        ([col, val]) => `${this.quoteIdentifier(col)} = ${this.formatValue(val)}`
      )
      .join(', ');

    const sql = `UPDATE ${table} SET ${setClauses} WHERE ${keyColumnQuoted} = ${keyValueFormatted}`;

    await this.connector.query(sql);
    return true;
  }

  /**
   * Quote an identifier (column/table name) for the database type.
   */
  private quoteIdentifier(name: string): string {
    switch (this.connector.type) {
      case 'sqlserver':
        return `[${name}]`;
      case 'postgresql':
        return `"${name}"`;
      case 'mysql':
        return `\`${name}\``;
      default:
        return name;
    }
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  /**
   * Format a value for SQL.
   */
  private formatValue(value: unknown): string {
    if (value === null || value === undefined) {
      return 'NULL';
    }

    if (typeof value === 'number') {
      return String(value);
    }

    if (typeof value === 'boolean') {
      // SQL Server uses 1/0, others might use TRUE/FALSE
      return this.connector.type === 'sqlserver'
        ? value
          ? '1'
          : '0'
        : value
          ? 'TRUE'
          : 'FALSE';
    }

    if (value instanceof Date) {
      return `'${value.toISOString()}'`;
    }

    if (typeof value === 'string') {
      // Escape single quotes
      const escaped = value.replace(/'/g, "''");
      return `'${escaped}'`;
    }

    if (typeof value === 'object') {
      // JSON serialize objects
      const json = JSON.stringify(value).replace(/'/g, "''");
      return `'${json}'`;
    }

    return `'${String(value).replace(/'/g, "''")}'`;
  }
}
