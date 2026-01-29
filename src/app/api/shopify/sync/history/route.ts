/**
 * Sync History API
 * GET /api/shopify/sync/history - Get sync history from ShopifySyncRun table
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const runs = await prisma.shopifySyncRun.findMany({
      orderBy: { StartedAt: 'desc' },
      take: limit,
      select: {
        ID: true,
        SyncType: true,
        EntityType: true,
        Status: true,
        StartedAt: true,
        CompletedAt: true,
        ItemCount: true,
        ErrorMessage: true,
      },
    });

    // Detect stale runs: started more than 10 minutes ago with no progress
    const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
    const now = Date.now();

    const history = runs.map((run) => {
      const startedAt = new Date(run.StartedAt).getTime();
      const isStale = run.Status === 'started' &&
                      (now - startedAt) > STALE_THRESHOLD_MS &&
                      (run.ItemCount ?? 0) === 0;

      return {
        id: String(run.ID),
        syncType: run.SyncType,
        entityType: run.EntityType ?? 'product',
        syncTime: run.CompletedAt ?? run.StartedAt,
        status:
          run.Status === 'completed'
            ? 'completed'
            : isStale
              ? 'failed' // Stale runs show as failed/timeout
              : run.Status === 'started'
                ? 'in_progress'
                : 'failed',
        itemCount: run.ItemCount ?? 0,
        errorMessage: isStale ? 'Sync timed out (no progress)' : run.ErrorMessage,
      };
    });

    return NextResponse.json({ history });
  } catch (error) {
    console.error('[Sync History] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sync history' },
      { status: 500 }
    );
  }
}
