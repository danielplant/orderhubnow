/**
 * Database Connector - Centralized database connection management
 *
 * Supports multiple database types with a unified interface.
 * For OrderHub, primarily uses SQL Server via the existing Prisma connection.
 */

import sql from 'mssql';
import type {
  DatabaseConnector,
  DatabaseSchema,
  ConnectionTestResult,
  DatabaseType,
} from '../types/database';
import { TIMEOUTS } from '../types/database';

// Re-export types for convenience
export type { DatabaseConnector, DatabaseSchema, ConnectionTestResult, DatabaseType };

// ============================================================================
// SQL Server Connector
// ============================================================================

export class SqlServerConnector implements DatabaseConnector {
  type: DatabaseType = 'sqlserver';
  private pool: sql.ConnectionPool | null = null;
  private connectionString: string;

  constructor(connectionString: string) {
    this.connectionString = connectionString;
  }

  private parseConfig(): sql.config {
    const conn = this.connectionString;

    // Handle URL format: mssql://user:pass@host:port/database or sqlserver://
    if (conn.startsWith('mssql://') || conn.startsWith('sqlserver://')) {
      const normalized = conn.replace('sqlserver://', 'mssql://');
      const url = new URL(normalized);

      // Parse query params for options
      const encrypt = url.searchParams.get('encrypt') === 'true';
      const trustServerCertificate = url.searchParams.get('trustServerCertificate') === 'true';

      return {
        user: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
        server: url.hostname,
        port: parseInt(url.port || '1433', 10),
        database: url.pathname.slice(1).split(';')[0], // Handle path like /database;options
        options: {
          encrypt,
          trustServerCertificate,
        },
        connectionTimeout: TIMEOUTS.connectionTest,
        requestTimeout: TIMEOUTS.query,
      };
    }

    // Handle ADO.NET format: Server=host;Database=db;User Id=user;Password=pass;
    const config: sql.config = {
      server: 'localhost',
      options: { encrypt: false, trustServerCertificate: true },
      connectionTimeout: TIMEOUTS.connectionTest,
      requestTimeout: TIMEOUTS.query,
    };

    conn.split(';').forEach((part) => {
      const eqIndex = part.indexOf('=');
      if (eqIndex === -1) return;

      const key = part.substring(0, eqIndex).trim().toLowerCase();
      const value = part.substring(eqIndex + 1).trim();

      switch (key) {
        case 'server':
        case 'data source': {
          const [host, port] = value.includes(',')
            ? value.split(',')
            : value.split(':');
          config.server = host ?? 'localhost';
          if (port) config.port = parseInt(port, 10);
          break;
        }
        case 'database':
        case 'initial catalog':
          config.database = value;
          break;
        case 'user id':
        case 'uid':
        case 'user':
          config.user = value;
          break;
        case 'password':
        case 'pwd':
          config.password = value;
          break;
        case 'encrypt':
          if (config.options) {
            config.options.encrypt = value.toLowerCase() === 'true';
          }
          break;
        case 'trustservercertificate':
          if (config.options) {
            config.options.trustServerCertificate = value.toLowerCase() === 'true';
          }
          break;
      }
    });

    return config;
  }

  private async getPool(): Promise<sql.ConnectionPool> {
    if (!this.pool || !this.pool.connected) {
      const config = this.parseConfig();
      this.pool = await sql.connect(config);
    }
    return this.pool;
  }

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      const pool = await this.getPool();
      const result = await pool.request().query('SELECT @@VERSION as version');
      const version = result.recordset[0]?.version;
      return {
        success: true,
        message: 'Connected successfully',
        type: 'sqlserver',
        serverVersion: version ? version.split('\n')[0] : undefined,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Connection failed',
        type: 'sqlserver',
      };
    }
  }

  async query<T>(sqlQuery: string, params?: unknown[]): Promise<T[]> {
    const pool = await this.getPool();
    const request = pool.request();

    // Add parameters if provided
    params?.forEach((param, index) => {
      request.input(`p${index}`, param);
    });

    const result = await request.query(sqlQuery);
    return result.recordset as T[];
  }

  async introspectSchema(): Promise<DatabaseSchema> {
    const pool = await this.getPool();

    const result = await pool.request().query(`
      SELECT
        c.TABLE_SCHEMA as [schema],
        c.TABLE_NAME as [table],
        c.COLUMN_NAME as [column],
        c.DATA_TYPE +
          CASE
            WHEN c.CHARACTER_MAXIMUM_LENGTH IS NOT NULL
              THEN '(' + CAST(c.CHARACTER_MAXIMUM_LENGTH as VARCHAR) + ')'
            WHEN c.NUMERIC_PRECISION IS NOT NULL AND c.DATA_TYPE IN ('decimal', 'numeric')
              THEN '(' + CAST(c.NUMERIC_PRECISION as VARCHAR) + ',' + CAST(c.NUMERIC_SCALE as VARCHAR) + ')'
            ELSE ''
          END as [type],
        CASE WHEN c.IS_NULLABLE = 'YES' THEN 1 ELSE 0 END as [nullable],
        CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END as [isPrimaryKey],
        CASE WHEN fk.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END as [isForeignKey],
        fk.REFERENCED_TABLE_NAME as [refTable],
        fk.REFERENCED_COLUMN_NAME as [refColumn]
      FROM INFORMATION_SCHEMA.COLUMNS c
      JOIN INFORMATION_SCHEMA.TABLES t
        ON c.TABLE_NAME = t.TABLE_NAME AND c.TABLE_SCHEMA = t.TABLE_SCHEMA
      LEFT JOIN (
        SELECT ku.TABLE_SCHEMA, ku.TABLE_NAME, ku.COLUMN_NAME
        FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
        JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
          ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
          AND tc.TABLE_SCHEMA = ku.TABLE_SCHEMA
        WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
      ) pk ON c.TABLE_SCHEMA = pk.TABLE_SCHEMA
          AND c.TABLE_NAME = pk.TABLE_NAME
          AND c.COLUMN_NAME = pk.COLUMN_NAME
      LEFT JOIN (
        SELECT
          fkc.parent_object_id,
          COL_NAME(fkc.parent_object_id, fkc.parent_column_id) as COLUMN_NAME,
          OBJECT_SCHEMA_NAME(fkc.parent_object_id) as TABLE_SCHEMA,
          OBJECT_NAME(fkc.parent_object_id) as TABLE_NAME,
          OBJECT_NAME(fkc.referenced_object_id) as REFERENCED_TABLE_NAME,
          COL_NAME(fkc.referenced_object_id, fkc.referenced_column_id) as REFERENCED_COLUMN_NAME
        FROM sys.foreign_key_columns fkc
      ) fk ON c.TABLE_SCHEMA = fk.TABLE_SCHEMA
          AND c.TABLE_NAME = fk.TABLE_NAME
          AND c.COLUMN_NAME = fk.COLUMN_NAME
      WHERE t.TABLE_TYPE = 'BASE TABLE'
      ORDER BY c.TABLE_SCHEMA, c.TABLE_NAME, c.ORDINAL_POSITION
    `);

    // Group by table
    const tablesMap = new Map<string, DatabaseSchema['tables'][0]>();

    for (const row of result.recordset) {
      const key = `${row.schema}.${row.table}`;

      if (!tablesMap.has(key)) {
        tablesMap.set(key, {
          name: row.table,
          schema: row.schema,
          columns: [],
        });
      }

      const table = tablesMap.get(key)!;
      table.columns.push({
        name: row.column,
        type: row.type,
        nullable: !!row.nullable,
        isPrimaryKey: !!row.isPrimaryKey,
        isForeignKey: !!row.isForeignKey,
        references: row.refTable
          ? {
              table: row.refTable,
              column: row.refColumn,
            }
          : undefined,
      });
    }

    return {
      tables: Array.from(tablesMap.values()),
      discoveredAt: new Date().toISOString(),
    };
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      this.pool = null;
    }
  }
}

// ============================================================================
// Connection String Parsing
// ============================================================================

export interface ParsedConnectionString {
  type: DatabaseType;
  normalized: string;
}

export function parseConnectionString(
  connectionString: string
): ParsedConnectionString | null {
  const trimmed = connectionString.trim();
  const lower = trimmed.toLowerCase();

  // SQL Server URL formats: mssql://, sqlserver://
  if (lower.startsWith('mssql://') || lower.startsWith('sqlserver://')) {
    return { type: 'sqlserver', normalized: trimmed };
  }

  // JDBC SQL Server format
  if (lower.startsWith('jdbc:sqlserver')) {
    return { type: 'sqlserver', normalized: trimmed };
  }

  // ADO.NET format detection (Server=, Data Source=)
  if (
    lower.includes('server=') ||
    lower.includes('data source=') ||
    lower.includes('initial catalog=')
  ) {
    return { type: 'sqlserver', normalized: trimmed };
  }

  // PostgreSQL formats
  if (lower.startsWith('postgresql://') || lower.startsWith('postgres://')) {
    return { type: 'postgresql', normalized: trimmed };
  }

  // MySQL format
  if (lower.startsWith('mysql://')) {
    return { type: 'mysql', normalized: trimmed };
  }

  return null;
}

export function maskConnectionString(connectionString: string): string {
  // Mask password in URL format
  let masked = connectionString.replace(
    /(:\/\/[^:]+:)([^@]+)(@)/gi,
    '$1****$3'
  );

  // Mask password in ADO.NET format
  masked = masked.replace(
    /(password|pwd)\s*=\s*[^;]+/gi,
    '$1=****'
  );

  return masked;
}

// ============================================================================
// Connector Factory
// ============================================================================

const connectors = new Map<string, DatabaseConnector>();

export async function getConnector(
  connectionString: string
): Promise<DatabaseConnector> {
  // Return existing connector if we have one
  const existing = connectors.get(connectionString);
  if (existing) {
    return existing;
  }

  const parsed = parseConnectionString(connectionString);
  if (!parsed) {
    throw new Error(
      'Invalid connection string format. Supported formats:\n' +
        '  - SQL Server: mssql://user:pass@host:port/database\n' +
        '  - SQL Server: Server=host;Database=db;User Id=user;Password=pass\n' +
        '  - PostgreSQL: postgresql://user:pass@host:port/database (not implemented)\n' +
        '  - MySQL: mysql://user:pass@host:port/database (not implemented)'
    );
  }

  let connector: DatabaseConnector;

  switch (parsed.type) {
    case 'sqlserver':
      connector = new SqlServerConnector(connectionString);
      break;
    case 'postgresql':
    case 'mysql':
      throw new Error(`${parsed.type} connector not yet implemented`);
  }

  connectors.set(connectionString, connector);
  return connector;
}

export async function closeConnector(connectionString: string): Promise<void> {
  const connector = connectors.get(connectionString);
  if (connector) {
    await connector.close();
    connectors.delete(connectionString);
  }
}

export async function closeAllConnectors(): Promise<void> {
  const closePromises: Promise<void>[] = [];

  for (const [key, connector] of connectors) {
    closePromises.push(
      connector.close().then(() => {
        connectors.delete(key);
      })
    );
  }

  await Promise.all(closePromises);
}
