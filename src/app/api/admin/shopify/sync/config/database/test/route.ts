/**
 * Database Connection Test API Route
 * POST /api/admin/shopify/sync/config/database/test - Test database connection
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getConnector,
  closeConnector,
  parseConnectionString,
  maskConnectionString,
} from '@/lib/sync-service';

const DatabaseConfigSchema = z.object({
  connectionString: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = DatabaseConfigSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } },
        { status: 400 }
      );
    }

    const { connectionString } = parsed.data;

    const connInfo = parseConnectionString(connectionString);
    if (!connInfo) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_CONNECTION_STRING',
            message: 'Could not detect database type from connection string',
          },
        },
        { status: 400 }
      );
    }

    console.log(`[Config] Testing database connection: ${connInfo.type} - ${maskConnectionString(connectionString)}`);

    try {
      const connector = await getConnector(connectionString);
      const result = await connector.testConnection();

      if (!result.success) {
        await closeConnector(connectionString);
      }

      return NextResponse.json(result);
    } catch (error) {
      await closeConnector(connectionString);

      const message = error instanceof Error ? error.message : 'Connection failed';
      console.error(`[Config] Database connection test failed: ${message}`);

      return NextResponse.json({
        success: false,
        type: connInfo.type,
        message,
      });
    }
  } catch (error) {
    console.error('[Config] Error testing database:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to test database connection' } },
      { status: 500 }
    );
  }
}
