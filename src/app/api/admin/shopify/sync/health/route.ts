/**
 * Health Check API Route
 * GET /api/admin/shopify/sync/health
 */

import { NextResponse } from 'next/server';
import {
  getConfigService,
  getConnector,
  getShopifyConnector,
  testRedisConnection,
  isRedisConfigured,
} from '@/lib/sync-service';

type ConnectionStatus = 'connected' | 'disconnected' | 'not_configured';

interface HealthStatus {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  uptime: number;
  connections: {
    database: ConnectionStatus;
    shopify: ConnectionStatus;
    redis: ConnectionStatus;
  };
}

const HEALTH_CHECK_TIMEOUT = 5000;

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Health check timeout')), ms);
  });
}

export async function GET() {
  const configService = getConfigService();
  const config = await configService.load();

  let dbStatus: ConnectionStatus = 'not_configured';
  let shopifyStatus: ConnectionStatus = 'not_configured';
  let redisStatus: ConnectionStatus = 'not_configured';

  // Database health check
  if (config.database?.connectionString) {
    try {
      const connector = await getConnector(config.database.connectionString);
      await Promise.race([
        connector.query('SELECT 1'),
        timeout(HEALTH_CHECK_TIMEOUT),
      ]);
      dbStatus = 'connected';
    } catch {
      dbStatus = 'disconnected';
    }
  }

  // Shopify health check
  if (config.shopify?.accessToken) {
    try {
      const connector = getShopifyConnector(config.shopify);
      const result = await Promise.race([
        connector.testConnection(),
        timeout(HEALTH_CHECK_TIMEOUT),
      ]);
      shopifyStatus = result.success ? 'connected' : 'disconnected';
    } catch {
      shopifyStatus = 'disconnected';
    }
  }

  // Redis health check
  if (isRedisConfigured()) {
    try {
      const result = await Promise.race([
        testRedisConnection(),
        timeout(HEALTH_CHECK_TIMEOUT),
      ]);
      redisStatus = result.success ? 'connected' : 'disconnected';
    } catch {
      redisStatus = 'disconnected';
    }
  }

  // Determine overall status
  const anyDisconnected =
    dbStatus === 'disconnected' ||
    shopifyStatus === 'disconnected' ||
    redisStatus === 'disconnected';

  const status: HealthStatus['status'] = anyDisconnected ? 'degraded' : 'ok';

  const response: HealthStatus = {
    status,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    connections: {
      database: dbStatus,
      shopify: shopifyStatus,
      redis: redisStatus,
    },
  };

  return NextResponse.json(response);
}
