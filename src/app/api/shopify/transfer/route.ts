import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/providers'
import { transferOrderToShopify } from '@/lib/data/actions/shopify'
import { isShopifyConfigured } from '@/lib/shopify/client'

/**
 * GET /api/shopify/transfer
 * Returns configuration status for order transfers.
 */
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const configured = isShopifyConfigured()
    return NextResponse.json({
      configured,
      message: configured
        ? 'Shopify is configured. Use POST to transfer orders.'
        : 'Shopify is not configured. Set SHOPIFY_STORE_DOMAIN and SHOPIFY_ACCESS_TOKEN.',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * POST /api/shopify/transfer
 * Transfer an order to Shopify.
 * 
 * Request body:
 * {
 *   "orderId": "123"
 * }
 * 
 * Response:
 * {
 *   "success": boolean,
 *   "shopifyOrderId": string (if success),
 *   "shopifyOrderNumber": string (if success),
 *   "missingSkus": string[] (if failed due to missing SKUs),
 *   "inactiveSkus": string[] (if failed due to inactive SKUs),
 *   "customerCreated": boolean (if customer was created),
 *   "error": string (if failed)
 * }
 */
export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if Shopify is configured
    if (!isShopifyConfigured()) {
      return NextResponse.json(
        {
          success: false,
          error: 'Shopify is not configured. Set SHOPIFY_STORE_DOMAIN and SHOPIFY_ACCESS_TOKEN environment variables.',
        },
        { status: 400 }
      )
    }

    // Parse request body
    const body = await request.json().catch(() => null)
    if (!body || !body.orderId) {
      return NextResponse.json(
        { success: false, error: 'orderId is required' },
        { status: 400 }
      )
    }

    // Transfer the order
    const result = await transferOrderToShopify(body.orderId)

    if (!result.success) {
      // Return 400 for business logic errors, but still include full result
      return NextResponse.json(result, { status: 400 })
    }

    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

// Remove PATCH and DELETE - not needed for transfer endpoint
