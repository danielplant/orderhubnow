/**
 * Config Service - Environment-based configuration management
 *
 * In OrderHub, configuration comes from environment variables rather than
 * a JSON config file. This service provides a compatible interface.
 */

import type { ShopifyConfig } from '../types/shopify';
import type { DatabaseType } from '../types/database';

// ============================================================================
// Config Types
// ============================================================================

export interface DatabaseConfig {
  connectionString: string;
  type: DatabaseType;
}

export interface RedisConfig {
  url: string;
}

export interface SyncServiceConfig {
  database?: DatabaseConfig;
  shopify?: ShopifyConfig;
  redis?: RedisConfig;
  lastUpdated?: string;
  lastSync?: string;
}

// ============================================================================
// Config Service
// ============================================================================

export class ConfigService {
  /**
   * Load configuration from environment variables.
   */
  async load(): Promise<SyncServiceConfig> {
    const config: SyncServiceConfig = {};

    // Database config from DATABASE_URL
    const databaseUrl = process.env.DATABASE_URL;
    if (databaseUrl) {
      config.database = {
        connectionString: databaseUrl,
        type: this.detectDatabaseType(databaseUrl),
      };
    }

    // Shopify config from env vars
    const shopifyDomain = process.env.SHOPIFY_STORE_DOMAIN;
    const shopifyToken = process.env.SHOPIFY_ACCESS_TOKEN;
    if (shopifyDomain && shopifyToken) {
      config.shopify = {
        storeDomain: shopifyDomain,
        accessToken: shopifyToken,
        apiVersion: process.env.SHOPIFY_API_VERSION ?? '2024-01',
        webhookSecret: process.env.SHOPIFY_WEBHOOK_SECRET,
      };
    }

    // Redis config from env var
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      config.redis = { url: redisUrl };
    }

    return config;
  }

  /**
   * Check if database is configured.
   */
  isDatabaseConfigured(): boolean {
    return !!process.env.DATABASE_URL;
  }

  /**
   * Check if Shopify is configured.
   */
  isShopifyConfigured(): boolean {
    return !!(process.env.SHOPIFY_STORE_DOMAIN && process.env.SHOPIFY_ACCESS_TOKEN);
  }

  /**
   * Check if Redis is configured.
   */
  isRedisConfigured(): boolean {
    return !!process.env.REDIS_URL;
  }

  /**
   * Get database connection string.
   */
  getDatabaseUrl(): string | undefined {
    return process.env.DATABASE_URL;
  }

  /**
   * Get Shopify config.
   */
  getShopifyConfig(): ShopifyConfig | null {
    const domain = process.env.SHOPIFY_STORE_DOMAIN;
    const token = process.env.SHOPIFY_ACCESS_TOKEN;

    if (!domain || !token) {
      return null;
    }

    return {
      storeDomain: domain,
      accessToken: token,
      apiVersion: process.env.SHOPIFY_API_VERSION ?? '2024-01',
      webhookSecret: process.env.SHOPIFY_WEBHOOK_SECRET,
    };
  }

  /**
   * Get Redis URL.
   */
  getRedisUrl(): string | undefined {
    return process.env.REDIS_URL;
  }

  /**
   * Detect database type from connection string.
   */
  private detectDatabaseType(connectionString: string): DatabaseType {
    const lower = connectionString.toLowerCase();

    if (
      lower.startsWith('sqlserver://') ||
      lower.startsWith('mssql://') ||
      lower.includes('server=') ||
      lower.includes('data source=')
    ) {
      return 'sqlserver';
    }

    if (lower.startsWith('postgresql://') || lower.startsWith('postgres://')) {
      return 'postgresql';
    }

    if (lower.startsWith('mysql://')) {
      return 'mysql';
    }

    // Default to sqlserver for OrderHub
    return 'sqlserver';
  }
}

// Singleton instance
let configServiceInstance: ConfigService | null = null;

export function getConfigService(): ConfigService {
  if (!configServiceInstance) {
    configServiceInstance = new ConfigService();
  }
  return configServiceInstance;
}
