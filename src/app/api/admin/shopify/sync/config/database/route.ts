/**
 * Database Config API Route
 * GET /api/admin/shopify/sync/config/database - Get database config status
 *
 * Note: Database connection is configured via DATABASE_URL environment variable.
 */

import { NextResponse } from 'next/server';
import { getConfigService, maskConnectionString } from '@/lib/sync-service';

export async function GET() {
  const configService = getConfigService();
  const config = await configService.load();

  if (!config.database) {
    return NextResponse.json({
      configured: false,
      message: 'DATABASE_URL environment variable not set',
    });
  }

  return NextResponse.json({
    configured: true,
    connectionString: maskConnectionString(config.database.connectionString),
    type: config.database.type,
    managedBy: 'DATABASE_URL environment variable',
  });
}
