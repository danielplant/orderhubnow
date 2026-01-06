#!/usr/bin/env node
/**
 * Step 1: Trigger Shopify Bulk Operation
 * Run: node step1-trigger.js
 */

const https = require('https');

const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = '2024-01';

if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_ACCESS_TOKEN) {
  console.error('ERROR: Set SHOPIFY_STORE_DOMAIN and SHOPIFY_ACCESS_TOKEN');
  process.exit(1);
}

const BULK_QUERY = `
mutation {
  bulkOperationRunQuery(
    query: """
    {
      productVariants {
        edges {
          node {
            id
            sku
            displayName
            price
            inventoryQuantity
            selectedOptions { name value }
            product {
              id
              title
              productType
              images(first: 1) { edges { node { url } } }
              metafields(first: 20) {
                edges {
                  node { namespace key value }
                }
              }
            }
            inventoryItem {
              id
              inventoryLevels(first: 10) {
                edges {
                  node {
                    quantities(names: ["available", "incoming", "committed"]) {
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
    }
    """
  ) {
    bulkOperation { id status }
    userErrors { field message }
  }
}
`;

const data = JSON.stringify({ query: BULK_QUERY });

const req = https.request({
  hostname: SHOPIFY_STORE_DOMAIN,
  port: 443,
  path: `/admin/api/${API_VERSION}/graphql.json`,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
    'Content-Length': data.length,
  },
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    const result = JSON.parse(body);
    const op = result.data?.bulkOperationRunQuery?.bulkOperation;
    const errors = result.data?.bulkOperationRunQuery?.userErrors;
    
    if (errors?.length) {
      console.error('Errors:', errors);
      process.exit(1);
    }
    
    if (op) {
      console.log('SUCCESS!');
      console.log('Operation ID:', op.id);
      console.log('Status:', op.status);
    } else {
      console.error('Failed:', body);
    }
  });
});

req.on('error', e => console.error('Error:', e.message));
req.write(data);
req.end();
