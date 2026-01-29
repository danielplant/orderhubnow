/**
 * Customer Sync API Route
 * POST /api/admin/shopify/sync-customers - Start a customer sync
 */

import { NextRequest, NextResponse } from 'next/server';
import { syncShopifyCustomers } from '@/lib/shopify/sync';

export async function POST(request: NextRequest) {
  try {
    console.log('[Customer Sync] Starting customer sync from API');

    const result = await syncShopifyCustomers((step, detail) => {
      console.log(`[Customer Sync] ${step}: ${detail}`);
    });

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
        },
        { status: 500 }
      );
    }

    console.log(`[Customer Sync] Completed - ${result.count} customers synced`);

    return NextResponse.json({
      success: true,
      count: result.count,
      message: `Synced ${result.count} customers from Shopify`,
    });
  } catch (error) {
    console.error('[Customer Sync] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to sync customers',
      },
      { status: 500 }
    );
  }
}
