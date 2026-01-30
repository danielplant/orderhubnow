import { NextRequest, NextResponse } from 'next/server'
import { validateQueryAgainstShopify } from '@/lib/shopify/query-generator'

export async function POST(request: NextRequest) {
  try {
    console.log('[Validate API] Running validation...')
    
    const result = await validateQueryAgainstShopify('bulk_sync')
    
    if (!result.valid) {
      return NextResponse.json({
        valid: false,
        error: result.error,
        message: 'Shopify rejected the query',
      }, { status: 400 })
    }
    
    return NextResponse.json({
      valid: true,
      message: 'Query validated successfully',
      stats: {
        metafieldCount: result.metafieldCount,
        testedAt: new Date().toISOString(),
      }
    })
    
  } catch (error) {
    console.error('[Validate API] Error:', error)
    return NextResponse.json({
      valid: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Validation failed',
    }, { status: 500 })
  }
}
