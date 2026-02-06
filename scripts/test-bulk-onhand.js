require('dotenv').config();
const fs = require('fs');

const domain = process.env.SHOPIFY_STORE_DOMAIN;
const token = process.env.SHOPIFY_ACCESS_TOKEN;
const version = process.env.SHOPIFY_API_VERSION || '2024-01';
const endpoint = `https://${domain}/admin/api/${version}/graphql.json`;
const sku = process.env.SKU || 'DYLAN-RS-6/12M';

async function gql(query, variables = {}) {
  const r = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (!r.ok || j.errors) throw new Error(JSON.stringify(j.errors || j));
  return j.data;
}

(async () => {
  const inner = `{
    productVariants(query: "sku:${sku}", first: 20) {
      edges {
        node {
          id
          sku
          inventoryItem {
            id
            inventoryLevels(first: 10) {
              edges {
                node {
                  id
                  quantities(names: ["on_hand","incoming","committed"]) { name quantity }
                }
              }
            }
          }
        }
      }
    }
  }`;

  const start = await gql(
    `mutation($q:String!){
      bulkOperationRunQuery(query:$q){
        bulkOperation{ id status }
        userErrors{ field message }
      }
    }`,
    { q: inner }
  );

  const errs = start.bulkOperationRunQuery.userErrors || [];
  if (errs.length) throw new Error(JSON.stringify(errs));

  const opId = start.bulkOperationRunQuery.bulkOperation.id;
  console.log('operationId:', opId);

  let url = null;
  while (!url) {
    await new Promise(r => setTimeout(r, 3000));
    const s = await gql(
      `query($id:ID!){
        node(id:$id){
          ... on BulkOperation { id status objectCount errorCode url }
        }
      }`,
      { id: opId }
    );
    const op = s.node;
    console.log('status:', op.status, 'objectCount:', op.objectCount);
    if (op.status === 'COMPLETED') url = op.url;
    if (op.status === 'FAILED' || op.status === 'CANCELED') {
      throw new Error(`Bulk ${op.status}: ${op.errorCode || 'unknown'}`);
    }
  }

  const resp = await fetch(url);
  const text = await resp.text();
  const file = `/tmp/shopify-bulk-${Date.now()}.jsonl`;
  fs.writeFileSync(file, text);
  console.log('saved:', file);

  const lines = text.trim().split('\n').filter(Boolean);
  let inv = 0, withParent = 0, withOnHand = 0;
  for (const line of lines) {
    const row = JSON.parse(line);
    if (String(row.id || '').includes('InventoryLevel')) {
      inv++;
      if (row.__parentId) withParent++;
      const names = (row.quantities || []).map(q => q.name);
      if (names.includes('on_hand')) withOnHand++;
    }
  }
  console.log({ inv, withParent, withOnHand, withoutOnHand: inv - withOnHand });

  // Print sample InventoryLevel lines
  console.log('\n--- Sample InventoryLevel JSONL lines ---');
  let count = 0;
  for (const line of lines) {
    const row = JSON.parse(line);
    if (String(row.id || '').includes('InventoryLevel') && count < 5) {
      console.log(JSON.stringify({ id: row.id, __parentId: row.__parentId, quantities: row.quantities }, null, 2));
      count++;
    }
  }
})();
