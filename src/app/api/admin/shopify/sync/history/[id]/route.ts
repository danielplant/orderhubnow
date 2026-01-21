/**
 * Single History Entry API Route
 * GET /api/admin/shopify/sync/history/[id] - Get history entry by ID
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSyncHistoryService } from '@/lib/sync-service';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const historyService = getSyncHistoryService();
    const entry = await historyService.get(id);

    if (!entry) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'History entry not found' } },
        { status: 404 }
      );
    }

    return NextResponse.json(entry);
  } catch (error) {
    console.error('[History] Error getting history entry:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get history entry' } },
      { status: 500 }
    );
  }
}
