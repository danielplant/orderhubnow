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
        Status: true,
        StartedAt: true,
        CompletedAt: true,
        ItemCount: true,
        ErrorMessage: true,
      },
    });

    const history = runs.map((run) => ({
      id: String(run.ID),
      syncType: run.SyncType,
      syncTime: run.CompletedAt ?? run.StartedAt,
      status:
        run.Status === 'completed'
          ? 'completed'
          : run.Status === 'started'
            ? 'in_progress'
            : 'failed',
      itemCount: run.ItemCount ?? 0,
      errorMessage: run.ErrorMessage,
    }));

    return NextResponse.json({ history });
  } catch (error) {
    console.error('[Sync History] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sync history' },
      { status: 500 }
    );
  }
}
