/**
 * Shopify Webhook Registration
 *
 * Utility to register the BULK_OPERATIONS_FINISH webhook with Shopify.
 * Run this once after deployment to set up webhook callbacks.
 *
 * Usage:
 *   npx ts-node -e "require('./src/lib/shopify/register-webhooks').registerBulkOperationWebhook()"
 *
 * Or call from a setup endpoint / admin action.
 */

import { isShopifyConfigured } from './client'

const WEBHOOK_SUBSCRIPTION_CREATE = `
  mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $callbackUrl: URL!) {
    webhookSubscriptionCreate(
      topic: $topic
      webhookSubscription: {
        callbackUrl: $callbackUrl
        format: JSON
      }
    ) {
      webhookSubscription {
        id
        topic
        endpoint {
          __typename
          ... on WebhookHttpEndpoint {
            callbackUrl
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`

const WEBHOOK_SUBSCRIPTIONS_QUERY = `
  query {
    webhookSubscriptions(first: 50) {
      edges {
        node {
          id
          topic
          endpoint {
            __typename
            ... on WebhookHttpEndpoint {
              callbackUrl
            }
          }
        }
      }
    }
  }
`

interface WebhookRegistrationResult {
  success: boolean
  webhookId?: string
  error?: string
  existingWebhook?: { id: string; callbackUrl: string }
}

/**
 * Register the BULK_OPERATIONS_FINISH webhook with Shopify.
 * This webhook is called when any bulk operation completes.
 */
export async function registerBulkOperationWebhook(): Promise<WebhookRegistrationResult> {
  if (!isShopifyConfigured()) {
    return { success: false, error: 'Shopify not configured' }
  }

  const storeDomain = process.env.SHOPIFY_STORE_DOMAIN!
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN!
  const apiVersion = process.env.SHOPIFY_API_VERSION || '2024-01'
  const appUrl = process.env.NEXT_PUBLIC_APP_URL

  if (!appUrl) {
    return { success: false, error: 'NEXT_PUBLIC_APP_URL not configured' }
  }

  const callbackUrl = `${appUrl}/api/webhooks/shopify/bulk-complete`
  const graphqlUrl = `https://${storeDomain}/admin/api/${apiVersion}/graphql.json`

  try {
    // First, check if webhook already exists
    const listResponse = await fetch(graphqlUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({ query: WEBHOOK_SUBSCRIPTIONS_QUERY }),
    })

    const listResult = await listResponse.json()
    const existingWebhooks = listResult.data?.webhookSubscriptions?.edges || []

    const existingBulkOpWebhook = existingWebhooks.find(
      (edge: { node: { topic: string; endpoint?: { callbackUrl?: string } } }) =>
        edge.node.topic === 'BULK_OPERATIONS_FINISH'
    )

    if (existingBulkOpWebhook) {
      const existing = existingBulkOpWebhook.node
      const existingUrl = existing.endpoint?.callbackUrl

      if (existingUrl === callbackUrl) {
        console.log('Webhook already registered with correct URL')
        return {
          success: true,
          webhookId: existing.id,
          existingWebhook: { id: existing.id, callbackUrl: existingUrl },
        }
      }

      console.log(`Webhook exists with different URL: ${existingUrl}`)
      console.log('Please delete it manually in Shopify admin before re-registering')
      return {
        success: false,
        error: `Webhook already exists with different URL: ${existingUrl}`,
        existingWebhook: { id: existing.id, callbackUrl: existingUrl || '' },
      }
    }

    // Register new webhook
    const createResponse = await fetch(graphqlUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({
        query: WEBHOOK_SUBSCRIPTION_CREATE,
        variables: {
          topic: 'BULK_OPERATIONS_FINISH',
          callbackUrl,
        },
      }),
    })

    const createResult = await createResponse.json()

    if (createResult.data?.webhookSubscriptionCreate?.userErrors?.length) {
      const errorMsg = createResult.data.webhookSubscriptionCreate.userErrors[0].message
      return { success: false, error: `Shopify error: ${errorMsg}` }
    }

    const webhookId = createResult.data?.webhookSubscriptionCreate?.webhookSubscription?.id

    if (!webhookId) {
      return { success: false, error: 'No webhook ID returned from Shopify' }
    }

    console.log(`Webhook registered successfully: ${webhookId}`)
    console.log(`Callback URL: ${callbackUrl}`)

    return { success: true, webhookId }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    console.error('Webhook registration failed:', errorMsg)
    return { success: false, error: errorMsg }
  }
}

/**
 * List all registered webhooks for this Shopify store.
 */
export async function listWebhooks(): Promise<
  Array<{ id: string; topic: string; callbackUrl?: string }>
> {
  if (!isShopifyConfigured()) {
    return []
  }

  const storeDomain = process.env.SHOPIFY_STORE_DOMAIN!
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN!
  const apiVersion = process.env.SHOPIFY_API_VERSION || '2024-01'

  try {
    const response = await fetch(
      `https://${storeDomain}/admin/api/${apiVersion}/graphql.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken,
        },
        body: JSON.stringify({ query: WEBHOOK_SUBSCRIPTIONS_QUERY }),
      }
    )

    const result = await response.json()
    const edges = result.data?.webhookSubscriptions?.edges || []

    return edges.map(
      (edge: { node: { id: string; topic: string; endpoint?: { callbackUrl?: string } } }) => ({
        id: edge.node.id,
        topic: edge.node.topic,
        callbackUrl: edge.node.endpoint?.callbackUrl,
      })
    )
  } catch (err) {
    console.error('Failed to list webhooks:', err)
    return []
  }
}
