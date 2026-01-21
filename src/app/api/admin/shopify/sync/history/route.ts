/**
 * Sync History API Route
 * GET /api/admin/shopify/sync/history - List sync history
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSyncHistoryService } from '@/lib/sync-service';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const mappingId = searchParams.get('mappingId') || undefined;
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const historyService = getSyncHistoryService();
    const result = await historyService.getRecent(limit, mappingId);

    return NextResponse.json(result);
  } catch (error) {
    console.error('[History] Error listing history:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to list history' } },
      { status: 500 }
    );
  }
}
