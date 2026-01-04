import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isShopifyConfigured, type ShopifyCustomerFull } from '@/lib/shopify/client'

// ============================================================================
// Types
// ============================================================================

interface ImportProgress {
  type: 'progress' | 'complete' | 'error'
  page?: number
  totalEstimate?: number
  processed?: number
  created?: number
  updated?: number
  errors?: number
  errorDetails?: Array<{ email: string; error: string }>
  message?: string
}

// ============================================================================
// Field Mapping: Shopify → Customers table
// ============================================================================
// email → Email
// firstName + lastName → CustomerName
// company (or name fallback) → StoreName
// phone → Phone
// defaultAddress.address1 → Street1
// defaultAddress.address2 → Street2
// defaultAddress.city → City
// defaultAddress.province → StateProvince
// defaultAddress.zip → ZipPostal
// defaultAddress.country → Country

function mapShopifyCustomer(shopifyCustomer: ShopifyCustomerFull): {
  Email: string
  CustomerName: string | null
  StoreName: string
  Phone: string | null
  Street1: string | null
  Street2: string | null
  City: string | null
  StateProvince: string | null
  ZipPostal: string | null
  Country: string | null
} {
  const firstName = shopifyCustomer.first_name?.trim() || ''
  const lastName = shopifyCustomer.last_name?.trim() || ''
  const fullName = [firstName, lastName].filter(Boolean).join(' ')
  const addr = shopifyCustomer.default_address

  // StoreName uses company if available, otherwise falls back to customer name
  const storeName = addr?.company?.trim() || fullName || shopifyCustomer.email

  return {
    Email: shopifyCustomer.email,
    CustomerName: fullName || null,
    StoreName: storeName,
    Phone: shopifyCustomer.phone?.trim() || addr?.zip ? null : null, // Use customer phone
    Street1: addr?.address1?.trim() || null,
    Street2: addr?.address2?.trim() || null,
    City: addr?.city?.trim() || null,
    StateProvince: addr?.province?.trim() || addr?.province_code?.trim() || null,
    ZipPostal: addr?.zip?.trim() || null,
    Country: addr?.country_code?.trim() || addr?.country?.trim() || null,
  }
}

// ============================================================================
// Streaming Import Handler
// ============================================================================

export async function POST() {
  // Check configuration
  if (!isShopifyConfigured()) {
    return NextResponse.json(
      { error: 'Shopify is not configured' },
      { status: 400 }
    )
  }

  // Create a TransformStream for streaming responses
  const encoder = new TextEncoder()
  const stream = new TransformStream()
  const writer = stream.writable.getWriter()

  const sendProgress = async (progress: ImportProgress) => {
    await writer.write(encoder.encode(JSON.stringify(progress) + '\n'))
  }

  // Start the import process in the background
  ;(async () => {
    try {
      const config = {
        storeDomain: process.env.SHOPIFY_STORE_DOMAIN!,
        accessToken: process.env.SHOPIFY_ACCESS_TOKEN!,
        apiVersion: process.env.SHOPIFY_API_VERSION || '2024-01',
      }

      const baseUrl = `https://${config.storeDomain}/admin/api/${config.apiVersion}`

      // Track progress
      let page = 0
      let totalProcessed = 0
      let created = 0
      let updated = 0
      let errors = 0
      const errorDetails: Array<{ email: string; error: string }> = []
      let sinceId = 0
      let hasMore = true

      // Estimate ~20 pages max (5000 customers at 250/page)
      const totalEstimate = 20

      while (hasMore) {
        page++

        await sendProgress({
          type: 'progress',
          page,
          totalEstimate,
          processed: totalProcessed,
          created,
          updated,
          errors,
          message: `Fetching page ${page}...`,
        })

        // Fetch customers from Shopify
        const url =
          sinceId > 0
            ? `${baseUrl}/customers.json?limit=250&since_id=${sinceId}`
            : `${baseUrl}/customers.json?limit=250`

        const response = await fetch(url, {
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': config.accessToken,
          },
        })

        if (!response.ok) {
          throw new Error(`Shopify API error: ${response.status}`)
        }

        const data = await response.json()
        const customers: ShopifyCustomerFull[] = data.customers || []

        if (customers.length === 0) {
          hasMore = false
          continue
        }

        // Process each customer
        for (const shopifyCustomer of customers) {
          totalProcessed++

          // Skip customers without email
          if (!shopifyCustomer.email) {
            errors++
            errorDetails.push({
              email: `ID: ${shopifyCustomer.id}`,
              error: 'No email address',
            })
            continue
          }

          try {
            const customerData = mapShopifyCustomer(shopifyCustomer)

            // Check if customer exists by email
            const existing = await prisma.customers.findFirst({
              where: { Email: shopifyCustomer.email },
              select: { ID: true },
            })

            if (existing) {
              // Update existing customer
              await prisma.customers.update({
                where: { ID: existing.ID },
                data: customerData,
              })
              updated++
            } else {
              // Create new customer
              await prisma.customers.create({
                data: customerData,
              })
              created++
            }
          } catch (err) {
            errors++
            errorDetails.push({
              email: shopifyCustomer.email,
              error: err instanceof Error ? err.message : 'Unknown error',
            })
          }
        }

        // Check if there are more pages
        if (customers.length < 250) {
          hasMore = false
        } else {
          sinceId = customers[customers.length - 1].id
        }

        // Send intermediate progress
        await sendProgress({
          type: 'progress',
          page,
          totalEstimate: Math.max(totalEstimate, page + 1),
          processed: totalProcessed,
          created,
          updated,
          errors,
          message: `Processed ${totalProcessed} customers...`,
        })
      }

      // Send completion
      await sendProgress({
        type: 'complete',
        processed: totalProcessed,
        created,
        updated,
        errors,
        errorDetails: errorDetails.slice(0, 50), // Limit error details
        message: 'Import complete',
      })
    } catch (err) {
      await sendProgress({
        type: 'error',
        message: err instanceof Error ? err.message : 'Import failed',
      })
    } finally {
      await writer.close()
    }
  })()

  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
