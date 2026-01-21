/**
 * Schema Cache Service - Caches discovered schemas using Prisma
 *
 * Schemas are cached so the UI can display them without re-introspecting.
 * This version uses a simple JSON file approach (same as original) but could
 * be adapted to use a database table if needed.
 */

import fs from 'fs/promises';
import path from 'path';
import type { DatabaseSchema, ShopifySchema } from '../types';

const CONFIG_DIR = process.env.SYNC_CONFIG_PATH ?? './config/sync-service';

/**
 * Service for caching discovered schemas.
 */
export class SchemaCacheService {
  private configPath: string;

  constructor() {
    this.configPath = CONFIG_DIR;
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.configPath, { recursive: true });
  }

  // Database Schema

  async saveDatabase(schema: DatabaseSchema): Promise<void> {
    await this.ensureDir();
    const filePath = path.join(this.configPath, 'schema-database.json');
    await fs.writeFile(filePath, JSON.stringify(schema, null, 2), 'utf-8');
  }

  async loadDatabase(): Promise<DatabaseSchema | null> {
    try {
      const filePath = path.join(this.configPath, 'schema-database.json');
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data) as DatabaseSchema;
    } catch {
      return null;
    }
  }

  async clearDatabase(): Promise<void> {
    try {
      const filePath = path.join(this.configPath, 'schema-database.json');
      await fs.unlink(filePath);
    } catch {
      // File doesn't exist, that's fine
    }
  }

  // Shopify Schema

  async saveShopify(schema: ShopifySchema): Promise<void> {
    await this.ensureDir();
    const filePath = path.join(this.configPath, 'schema-shopify.json');
    await fs.writeFile(filePath, JSON.stringify(schema, null, 2), 'utf-8');
  }

  async loadShopify(): Promise<ShopifySchema | null> {
    try {
      const filePath = path.join(this.configPath, 'schema-shopify.json');
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data) as ShopifySchema;
    } catch {
      return null;
    }
  }

  async clearShopify(): Promise<void> {
    try {
      const filePath = path.join(this.configPath, 'schema-shopify.json');
      await fs.unlink(filePath);
    } catch {
      // File doesn't exist, that's fine
    }
  }

  // Clear all cached schemas

  async clearAll(): Promise<void> {
    await Promise.all([this.clearDatabase(), this.clearShopify()]);
  }
}

// Singleton instance
let schemaCacheInstance: SchemaCacheService | null = null;

export function getSchemaCache(): SchemaCacheService {
  if (!schemaCacheInstance) {
    schemaCacheInstance = new SchemaCacheService();
  }
  return schemaCacheInstance;
}
