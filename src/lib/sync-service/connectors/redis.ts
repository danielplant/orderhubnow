/**
 * Redis Connector - Centralized Redis connection management
 *
 * Features:
 * - Single shared Redis client for BullMQ and health checks
 * - Connection testing with latency measurement
 * - Graceful degradation when Redis is not configured
 * - Configuration from environment variables
 */

import Redis from 'ioredis';

// ============================================================================
// Module State
// ============================================================================

let redisClient: Redis | null = null;
let configuredUrl: string | null = null;

// ============================================================================
// Configuration
// ============================================================================

/**
 * Get Redis URL from environment.
 * Returns undefined if not configured (graceful degradation).
 */
export function getRedisUrl(): string | undefined {
  return process.env.REDIS_URL;
}

/**
 * Check if Redis is configured.
 */
export function isRedisConfigured(): boolean {
  return !!process.env.REDIS_URL;
}

// ============================================================================
// Connection Management
// ============================================================================

/**
 * Get the shared Redis client, creating it if necessary.
 * The client is configured for BullMQ compatibility.
 * Throws if Redis is not configured.
 */
export async function getRedisClient(): Promise<Redis> {
  const url = getRedisUrl();

  if (!url) {
    throw new Error(
      'Redis is not configured. Set REDIS_URL environment variable to enable scheduling and queue features.'
    );
  }

  // If URL changed, close existing client
  if (redisClient && configuredUrl !== url) {
    await closeRedis();
  }

  if (!redisClient) {
    redisClient = new Redis(url, {
      maxRetriesPerRequest: null, // Required for BullMQ
      enableReadyCheck: false,
      lazyConnect: true,
    });

    await redisClient.connect();
    configuredUrl = url;

    console.log(`[RedisConnector] Connected to ${maskRedisUrl(url)}`);
  }

  return redisClient;
}

/**
 * Get Redis connection options for BullMQ.
 * Returns host/port for BullMQ's internal connection management.
 * Throws if Redis is not configured.
 */
export function getRedisConnectionOptions(): {
  host: string;
  port: number;
  password?: string;
} {
  const url = getRedisUrl();

  if (!url) {
    throw new Error(
      'Redis is not configured. Set REDIS_URL environment variable to enable scheduling.'
    );
  }

  const parsed = new URL(url);

  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || '6379', 10),
    password: parsed.password || undefined,
  };
}

/**
 * Close the shared Redis connection.
 */
export async function closeRedis(): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.quit();
      console.log('[RedisConnector] Connection closed');
    } catch (err) {
      console.warn(`[RedisConnector] Error closing connection: ${err}`);
    } finally {
      redisClient = null;
      configuredUrl = null;
    }
  }
}

// ============================================================================
// Health Checks
// ============================================================================

export interface RedisTestResult {
  success: boolean;
  latencyMs?: number;
  error?: string;
  url?: string;
}

/**
 * Test Redis connection with optional custom URL.
 * Creates a temporary connection for testing, doesn't affect shared client.
 */
export async function testRedisConnection(url?: string): Promise<RedisTestResult> {
  const testUrl = url ?? getRedisUrl();

  if (!testUrl) {
    return {
      success: false,
      error: 'Redis not configured',
    };
  }

  const testClient = new Redis(testUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null, // Don't retry on test
    connectTimeout: 5000,
  });

  try {
    const start = Date.now();
    await testClient.connect();
    await testClient.ping();
    const latencyMs = Date.now() - start;

    return {
      success: true,
      latencyMs,
      url: maskRedisUrl(testUrl),
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      url: maskRedisUrl(testUrl),
    };
  } finally {
    try {
      testClient.disconnect();
    } catch {
      // Ignore disconnect errors
    }
  }
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Mask sensitive parts of Redis URL for logging.
 */
export function maskRedisUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = '****';
    }
    return parsed.toString();
  } catch {
    return url.replace(/:([^@]+)@/, ':****@');
  }
}
