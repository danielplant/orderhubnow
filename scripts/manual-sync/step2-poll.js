#!/usr/bin/env node
/**
 * Step 2: Poll for Bulk Operation Completion
 * Run: node step2-poll.js "gid://shopify/BulkOperation/XXXXX"
 */

const https = require('https');

const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = '2024-01';
const operationId = process.argv[2];

if (!operationId) {
  console.error('Usage: node step2-poll.js <operationId>');
  process.exit(1);
}

const POLL_QUERY = `
query {
  node(id: "${operationId}") {
    ... on BulkOperation {
      id
      status
      errorCode
      objectCount
      fileSize
      url
    }
  }
}
`;

function poll() {
  const data = JSON.stringify({ query: POLL_QUERY });
  
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
      const op = result.data?.node;
      
      if (!op) {
        console.error('Operation not found');
        process.exit(1);
      }
      
      console.log(`Status: ${op.status} | Objects: ${op.objectCount || 0}`);
      
      if (op.status === 'COMPLETED') {
        console.log('\n=== COMPLETED ===');
        console.log('Objects:', op.objectCount);
        console.log('File Size:', op.fileSize, 'bytes');
        console.log('\nDownload URL:');
        console.log(op.url);
        process.exit(0);
      }
      
      if (op.status === 'FAILED' || op.status === 'CANCELED') {
        console.error('Operation failed:', op.errorCode);
        process.exit(1);
      }
      
      // Poll again in 5 seconds
      setTimeout(poll, 5000);
    });
  });
  
  req.on('error', e => { console.error('Error:', e.message); process.exit(1); });
  req.write(data);
  req.end();
}

console.log('Polling for:', operationId);
console.log('(Checking every 5 seconds...)\n');
poll();
