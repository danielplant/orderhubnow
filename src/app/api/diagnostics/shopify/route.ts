import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/providers'
import { shopifyGraphQLFetch } from '@/lib/shopify/client'

interface QuantityData {
  name: string
  quantity: number
}

interface ShopifyVariantResponse {
  productVariants?: {
    edges?: Array<{
      node: {
        sku: string
        displayName: string
        inventoryItem?: {
          inventoryLevels?: {
            edges?: Array<{
              node: {
                quantities?: QuantityData[]
              }
            }>
          }
        }
      }
    }>
  }
}

export async function GET(request: NextRequest) {
  // 1. Auth check (admin or rep)
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Get SKU from query params
  const sku = request.nextUrl.searchParams.get('sku')
  if (!sku) {
    return NextResponse.json({ error: 'SKU required' }, { status: 400 })
  }

  // 3. GraphQL query - same as diagnostic script
  const query = `{
    productVariants(first: 1, query: "sku:${sku}") {
      edges {
        node {
          sku
          displayName
          inventoryItem {
            inventoryLevels(first: 1) {
              edges {
                node {
                  quantities(names: ["on_hand", "committed", "incoming"]) {
                    name
                    quantity
                  }
                }
              }
            }
          }
        }
      }
    }
  }`

  // 4. Call Shopify
  const result = await shopifyGraphQLFetch(query)

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  // 5. Extract and return raw values
  // Note: shopifyGraphQLFetch returns { data: <GraphQL response> }
  // and GraphQL response is { data: { productVariants: ... } }
  const graphqlResponse = result.data as { data?: ShopifyVariantResponse }
  const data = graphqlResponse?.data
  const variant = data?.productVariants?.edges?.[0]?.node
  const quantities = variant?.inventoryItem?.inventoryLevels?.edges?.[0]?.node?.quantities || []

  const response = {
    sku: variant?.sku || sku,
    displayName: variant?.displayName || null,
    onHand: quantities.find((q) => q.name === 'on_hand')?.quantity ?? null,
    committed: quantities.find((q) => q.name === 'committed')?.quantity ?? null,
    incoming: quantities.find((q) => q.name === 'incoming')?.quantity ?? null,
    // Include raw response for debugging
    _raw: result.data,
  }

  return NextResponse.json(response)
}
