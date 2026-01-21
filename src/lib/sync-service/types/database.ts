/**
 * Database Types - Database connector interfaces and types
 */

export interface DatabaseConnector {
  type: DatabaseType;

  // Test if connection works
  testConnection(): Promise<ConnectionTestResult>;

  // Introspect schema - discover all tables and columns
  introspectSchema(): Promise<DatabaseSchema>;

  // Execute raw query
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;

  // Cleanup
  close(): Promise<void>;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  type: DatabaseType;
  serverVersion?: string;
}

export interface DatabaseColumn {
  name: string;
  type: string;
  nullable: boolean;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  references?: {
    table: string;
    column: string;
  };
}

export interface DatabaseTable {
  name: string;
  schema: string;
  columns: DatabaseColumn[];
}

export interface DatabaseSchema {
  tables: DatabaseTable[];
  discoveredAt: string;
}

export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export const TIMEOUTS = {
  connectionTest: 10_000,
  introspection: 30_000,
  healthCheck: 5_000,
  query: 30_000,
} as const;

export type DatabaseType = 'sqlserver' | 'postgresql' | 'mysql';
