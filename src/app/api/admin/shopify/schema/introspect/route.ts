import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { shopifyGraphQLFetch } from '@/lib/shopify/client'

const METAFIELD_QUERY = `
{
  metafieldDefinitions(ownerType: PRODUCT, first: 100) {
    edges {
      node {
        namespace
        key
        name
        description
        type { name }
      }
    }
  }
}
`

function capitalize(str: string): string {
  // Convert snake_case to PascalCase: order_entry_collection -> OrderEntryCollection
  return str
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

export async function POST() {
  try {
    console.log('[Introspect] Starting Shopify schema introspection...')
    
    // Query Shopify for Product metafield definitions
    const result = await shopifyGraphQLFetch(METAFIELD_QUERY)
    
    if (result.error) {
      return NextResponse.json({
        success: false,
        error: 'Failed to query Shopify: ' + result.error,
      }, { status: 500 })
    }
    
    // Type the response data
    interface MetafieldNode {
      namespace: string
      key: string
      name: string
      description: string
      type: { name: string }
    }
    type MetafieldResponse = {
      data?: {
        metafieldDefinitions?: {
          edges?: Array<{ node: MetafieldNode }>
        }
      }
    }
    
    const data = result.data as MetafieldResponse | undefined
    const metafields = data?.data?.metafieldDefinitions?.edges?.map((e) => e.node) || []
    
    console.log(`[Introspect] Found ${metafields.length} Product metafield definitions`)
    
    // Track what we find
    let created = 0
    let updated = 0
    let markedRemoved = 0
    
    // Get all existing metafield mappings for bulk_sync
    const existingMappings = await prisma.shopifyFieldMapping.findMany({
      where: { serviceName: 'bulk_sync', fieldType: 'metafield' },
    })
    
    // Create a set of discovered metafield keys for comparison
    const discoveredKeys = new Set(
      metafields.map((mf) => `${mf.namespace}:${mf.key}`)
    )
    
    // Process each discovered metafield
    for (const mf of metafields) {
      const fieldPath = `product.mf${capitalize(mf.key)}.value`
      const fullPath = `ProductVariant.${fieldPath}`
      
      const existing = await prisma.shopifyFieldMapping.findFirst({
        where: { 
          fullPath,
          connectionId: 'default',
        }
      })
      
      if (existing) {
        // Update existing - mark as accessible
        await prisma.shopifyFieldMapping.update({
          where: { id: existing.id },
          data: { 
            accessStatus: 'accessible',
            metafieldNamespace: mf.namespace,
            metafieldKey: mf.key,
          }
        })
        updated++
      } else {
        // New metafield discovered - create with enabled=false
        await prisma.shopifyFieldMapping.create({
          data: {
            connectionId: 'default',
            entityType: 'ProductVariant',
            fieldPath,
            fullPath,
            depth: 3,
            fieldType: 'metafield',
            serviceName: 'bulk_sync',
            metafieldNamespace: mf.namespace,
            metafieldKey: mf.key,
            enabled: false, // Disabled by default until user enables
            accessStatus: 'accessible',
          }
        })
        created++
        console.log(`[Introspect] Created new metafield: ${mf.namespace}:${mf.key}`)
      }
    }
    
    // Mark existing mappings as removed if not found in Shopify
    for (const existing of existingMappings) {
      if (existing.metafieldNamespace && existing.metafieldKey) {
        const key = `${existing.metafieldNamespace}:${existing.metafieldKey}`
        if (!discoveredKeys.has(key)) {
          await prisma.shopifyFieldMapping.update({
            where: { id: existing.id },
            data: { accessStatus: 'removed' }
          })
          markedRemoved++
          console.log(`[Introspect] Marked as removed: ${key}`)
        }
      }
    }
    
    return NextResponse.json({
      success: true,
      message: 'Schema introspection complete',
      stats: {
        discovered: metafields.length,
        created,
        updated,
        markedRemoved,
        introspectedAt: new Date().toISOString(),
      }
    })
    
  } catch (error) {
    console.error('[Introspect] Error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}
