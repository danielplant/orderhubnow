/**
 * Dashboard Errors API Route
 * GET /api/admin/shopify/sync/dashboard/errors - Get recent sync errors
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSyncHistoryService } from '@/lib/sync-service';
import type { SyncHistoryEntry } from '@/lib/sync-service';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const historyService = getSyncHistoryService();
    // Use getByStatus to get failed runs directly
    const failedRuns = await historyService.getByStatus('failed', limit);

    // Filter to runs with errors and extract error info
    const errors = failedRuns
      .filter((entry: SyncHistoryEntry) => entry.errors.length > 0)
      .map((entry: SyncHistoryEntry) => ({
        id: entry.id,
        mappingId: entry.mappingId,
        mappingName: entry.mappingName,
        syncType: entry.type,
        startedAt: entry.startedAt,
        errors: entry.errors,
        triggeredBy: entry.triggeredBy,
      }));

    return NextResponse.json({
      success: true,
      errors,
      total: errors.length,
    });
  } catch (error) {
    console.error('[Dashboard] Error getting errors:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get errors' } },
      { status: 500 }
    );
  }
}
