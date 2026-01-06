import { NextResponse } from 'next/server'

// ============================================================================
// POST /api/webhooks/shopify/bulk-complete
// DISABLED: We now use polling instead of webhooks to avoid concurrency issues
// ============================================================================

export async function POST() {
  console.log('Webhook received but ignored - using polling mode')
  return NextResponse.json({ received: true, mode: 'polling' })
}
