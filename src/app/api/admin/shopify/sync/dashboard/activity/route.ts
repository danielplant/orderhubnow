/**
 * Dashboard Activity API Route
 * GET /api/admin/shopify/sync/dashboard/activity - Get recent sync activity
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSyncHistoryService } from '@/lib/sync-service';
import type { SyncHistoryEntry } from '@/lib/sync-service';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    const historyService = getSyncHistoryService();
    const recentHistory = await historyService.getRecent(limit);

    // Format as activity feed items
    const activity = recentHistory.entries.map((entry: SyncHistoryEntry) => ({
      id: entry.id,
      type: entry.type,
      mappingId: entry.mappingId,
      mappingName: entry.mappingName,
      status: entry.status,
      startedAt: entry.startedAt,
      completedAt: entry.completedAt,
      recordsWritten: entry.stats.inserted + entry.stats.updated,
      durationMs: entry.duration?.totalMs,
      triggeredBy: entry.triggeredBy,
    }));

    return NextResponse.json({
      success: true,
      activity,
    });
  } catch (error) {
    console.error('[Dashboard] Error getting activity:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get activity' } },
      { status: 500 }
    );
  }
}
