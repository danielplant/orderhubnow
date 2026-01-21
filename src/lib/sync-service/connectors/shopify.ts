/**
 * Shopify Connector - Shopify GraphQL API client with rate limiting
 */

import type {
  ShopifyConfig,
  ShopifyConnectionTestResult,
  ShopifySchema,
  MetafieldOwnerType,
} from '../types/shopify';
import { METAFIELD_OWNER_TYPES, RELEVANT_TYPES } from '../types/shopify';

// ============================================================================
// Rate Limiter
// ============================================================================

class ShopifyRateLimiter {
  private currentUsage = 0;
  private maxCapacity = 1000;
  private restoreRate = 50; // points per second
  private lastUpdate = Date.now();

  updateFromHeader(header: string | null): void {
    if (!header) return;

    // Header format: "40/1000"
    const match = header.match(/(\d+)\/(\d+)/);
    if (match) {
      this.currentUsage = parseInt(match[1]!, 10);
      this.maxCapacity = parseInt(match[2]!, 10);
      this.lastUpdate = Date.now();
    }
  }

  async waitIfNeeded(): Promise<void> {
    // Calculate current usage with time decay
    const elapsed = (Date.now() - this.lastUpdate) / 1000;
    const restored = Math.floor(elapsed * this.restoreRate);
    const estimated = Math.max(0, this.currentUsage - restored);

    // If we're above 80% capacity, wait
    if (estimated > this.maxCapacity * 0.8) {
      const waitTime = ((estimated - this.maxCapacity * 0.5) / this.restoreRate) * 1000;
      await this.delay(Math.min(waitTime, 5000));
    }
  }

  shouldRetry(statusCode: number): boolean {
    return statusCode === 429;
  }

  getBackoffTime(attempt: number): number {
    // Exponential backoff: 1s, 2s, 4s, ...
    return Math.min(1000 * Math.pow(2, attempt), 30000);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Shopify Connector Class
// ============================================================================

export class ShopifyConnector {
  private config: ShopifyConfig;
  private rateLimiter: ShopifyRateLimiter;

  constructor(config: ShopifyConfig) {
    this.config = config;
    this.rateLimiter = new ShopifyRateLimiter();
  }

  private get endpoint(): string {
    const domain = this.config.storeDomain.replace(/^https?:\/\//, '');
    return `https://${domain}/admin/api/${this.config.apiVersion}/graphql.json`;
  }

  /**
   * Execute a GraphQL query with rate limiting and retry logic.
   */
  async query<T>(
    query: string,
    variables?: Record<string, unknown>,
    maxRetries = 3
  ): Promise<T> {
    await this.rateLimiter.waitIfNeeded();

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await fetch(this.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': this.config.accessToken,
          },
          body: JSON.stringify({ query, variables }),
        });

        // Update rate limiter from response header
        this.rateLimiter.updateFromHeader(
          response.headers.get('X-Shopify-Shop-Api-Call-Limit')
        );

        // Handle rate limiting
        if (this.rateLimiter.shouldRetry(response.status)) {
          const backoff = this.rateLimiter.getBackoffTime(attempt);
          console.log(
            `[Shopify] Rate limited (429), retrying in ${backoff}ms`
          );
          await this.delay(backoff);
          continue;
        }

        // Handle other errors
        if (!response.ok) {
          const text = await response.text();
          throw new Error(
            `Shopify API error: ${response.status} ${response.statusText} - ${text}`
          );
        }

        const json = (await response.json()) as {
          data?: T;
          errors?: Array<{ message: string }>;
        };

        // Handle GraphQL errors
        if (json.errors && json.errors.length > 0) {
          const messages = json.errors.map((e) => e.message).join('; ');
          throw new Error(`GraphQL errors: ${messages}`);
        }

        if (!json.data) {
          throw new Error('No data in response');
        }

        return json.data;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on non-retryable errors
        if (
          lastError.message.includes('401') ||
          lastError.message.includes('403')
        ) {
          throw lastError;
        }

        if (attempt < maxRetries - 1) {
          const backoff = this.rateLimiter.getBackoffTime(attempt);
          console.log(
            `[Shopify] Request failed, retrying in ${backoff}ms: ${lastError.message}`
          );
          await this.delay(backoff);
        }
      }
    }

    throw lastError || new Error('Request failed after retries');
  }

  /**
   * Test the Shopify connection by querying shop info.
   */
  async testConnection(): Promise<ShopifyConnectionTestResult> {
    try {
      const data = await this.query<{ shop: { name: string; id: string } }>(`
        { shop { name id } }
      `);

      return {
        success: true,
        message: `Connected to ${data.shop.name}`,
        shopName: data.shop.name,
        shopId: data.shop.id,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection failed';

      // Provide helpful error messages
      let friendlyMessage = message;
      if (message.includes('401')) {
        friendlyMessage = 'Invalid access token. Please check your credentials.';
      } else if (message.includes('403')) {
        friendlyMessage = 'Access denied. Token may lack required permissions.';
      } else if (message.includes('404')) {
        friendlyMessage = 'Store not found. Please check the store domain.';
      }

      return {
        success: false,
        message: friendlyMessage,
      };
    }
  }

  /**
   * Introspect the Shopify GraphQL schema to discover available resources and fields.
   */
  async introspectSchema(): Promise<ShopifySchema> {
    // 1. Get GraphQL schema introspection
    const schemaData = await this.query<{
      __schema: {
        types: Array<{
          name: string;
          kind: string;
          fields?: Array<{
            name: string;
            type: {
              name: string | null;
              kind: string;
              ofType?: { name: string | null; kind: string };
            };
            description?: string;
          }>;
        }>;
      };
    }>(`
      {
        __schema {
          types {
            name
            kind
            fields {
              name
              type { name kind ofType { name kind } }
              description
            }
          }
        }
      }
    `);

    // Filter to relevant types
    const resources = schemaData.__schema.types
      .filter(
        (t) =>
          RELEVANT_TYPES.includes(t.name as (typeof RELEVANT_TYPES)[number]) &&
          t.kind === 'OBJECT' &&
          t.fields
      )
      .map((t) => ({
        name: t.name,
        fields: (t.fields || []).map((f) => ({
          name: f.name,
          type: this.resolveTypeName(f.type),
          description: f.description,
        })),
      }));

    // 2. Get metafield definitions for all owner types
    const metafieldDefinitions: ShopifySchema['metafieldDefinitions'] = [];

    for (const ownerType of METAFIELD_OWNER_TYPES) {
      try {
        const definitions = await this.fetchMetafieldDefinitions(ownerType);
        metafieldDefinitions.push(...definitions);
      } catch (error) {
        // Some owner types might not be accessible with current token permissions
        console.log(
          `[Shopify] Could not fetch metafields for ${ownerType}: ${
            error instanceof Error ? error.message : error
          }`
        );
      }
    }

    return {
      resources,
      metafieldDefinitions,
      discoveredAt: new Date().toISOString(),
    };
  }

  /**
   * Fetch metafield definitions for a specific owner type.
   */
  private async fetchMetafieldDefinitions(
    ownerType: MetafieldOwnerType
  ): Promise<ShopifySchema['metafieldDefinitions']> {
    const data = await this.query<{
      metafieldDefinitions: {
        edges: Array<{
          node: {
            namespace: string;
            key: string;
            type: { name: string };
          };
        }>;
      };
    }>(
      `
      query($ownerType: MetafieldOwnerType!) {
        metafieldDefinitions(first: 100, ownerType: $ownerType) {
          edges {
            node {
              namespace
              key
              type { name }
            }
          }
        }
      }
    `,
      { ownerType }
    );

    return data.metafieldDefinitions.edges.map((edge) => ({
      namespace: edge.node.namespace,
      key: edge.node.key,
      type: edge.node.type.name,
      ownerType,
    }));
  }

  /**
   * Resolve GraphQL type to a readable string.
   */
  private resolveTypeName(type: {
    name: string | null;
    kind: string;
    ofType?: { name: string | null; kind: string };
  }): string {
    if (type.name) {
      return type.name;
    }
    if (type.ofType?.name) {
      return type.kind === 'NON_NULL'
        ? `${type.ofType.name}!`
        : type.kind === 'LIST'
          ? `[${type.ofType.name}]`
          : type.ofType.name;
    }
    return type.kind;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Connector Factory
// ============================================================================

const connectors = new Map<string, ShopifyConnector>();

/**
 * Get or create a Shopify connector for the given config.
 */
export function getShopifyConnector(config: ShopifyConfig): ShopifyConnector {
  const key = `${config.storeDomain}:${config.apiVersion}`;

  const existing = connectors.get(key);
  if (existing) {
    return existing;
  }

  const connector = new ShopifyConnector(config);
  connectors.set(key, connector);
  return connector;
}

/**
 * Clear cached Shopify connectors.
 */
export function clearShopifyConnectors(): void {
  connectors.clear();
}

/**
 * Get Shopify config from environment variables.
 */
export function getShopifyConfigFromEnv(): ShopifyConfig | null {
  const storeDomain = process.env.SHOPIFY_STORE_DOMAIN;
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
  const apiVersion = process.env.SHOPIFY_API_VERSION ?? '2024-01';

  if (!storeDomain || !accessToken) {
    return null;
  }

  return {
    storeDomain,
    accessToken,
    apiVersion,
    webhookSecret: process.env.SHOPIFY_WEBHOOK_SECRET,
  };
}
