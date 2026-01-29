/**
 * Test script for buildSchemaGraph
 * Run: npx tsx scripts/test-schema-graph.ts
 */

import { buildSchemaGraph } from '../src/lib/shopify/schema-graph'

async function test() {
  console.log('Testing buildSchemaGraph...\n')

  const graph = await buildSchemaGraph()

  if (!graph) {
    console.log('Result: null (cache not populated)')
    console.log('\nRun schema introspection first to populate the cache.')
    return
  }

  console.log('=== Summary ===')
  console.log('Entities:', graph.entityCount)
  console.log('Fields:', graph.fieldCount)
  console.log('Relationships:', graph.relationshipCount)
  console.log('Total Nodes:', graph.nodes.length)
  console.log('Total Edges:', graph.edges.length)
  console.log('API Version:', graph.apiVersion)
  console.log('Generated At:', graph.generatedAt)

  console.log('\n=== Entity Nodes ===')
  const entityNodes = graph.nodes.filter((n) => n.data.nodeType === 'entity')
  for (const node of entityNodes) {
    const data = node.data as { entityName: string; fieldCount: number }
    console.log(`  ${data.entityName}: ${data.fieldCount} fields at (${node.position.x}, ${node.position.y})`)
  }

  console.log('\n=== Relationship Fields ===')
  const relationshipFields = graph.nodes.filter(
    (n) => n.data.nodeType === 'field' && (n.data as { isRelationship: boolean }).isRelationship
  )
  for (const node of relationshipFields) {
    const data = node.data as { fullPath: string; targetEntity: string }
    console.log(`  ${data.fullPath} -> ${data.targetEntity}`)
  }

  console.log('\n=== Sample Subfields (depth 2) ===')
  const subfields = graph.nodes
    .filter((n) => n.data.nodeType === 'field' && (n.data as { depth: number }).depth === 2)
    .slice(0, 10)
  for (const node of subfields) {
    const data = node.data as { fullPath: string; baseType: string }
    console.log(`  ${data.fullPath} (type: ${data.baseType})`)
  }

  console.log('\n=== Edge Counts by Type ===')
  const edgeTypes: Record<string, number> = {}
  for (const edge of graph.edges) {
    const type = (edge.data as { edgeType: string } | undefined)?.edgeType || 'unknown'
    edgeTypes[type] = (edgeTypes[type] || 0) + 1
  }
  console.log(edgeTypes)

  // Verify specific expected relationships
  console.log('\n=== Verification Checks ===')

  const inventoryItemField = graph.nodes.find((n) => n.id === 'field:ProductVariant.inventoryItem')
  if (inventoryItemField) {
    const data = inventoryItemField.data as { isRelationship: boolean; targetEntity: string }
    console.log('✓ ProductVariant.inventoryItem:', {
      isRelationship: data.isRelationship,
      targetEntity: data.targetEntity,
    })
  } else {
    console.log('✗ ProductVariant.inventoryItem not found')
  }

  // Note: ProductVariant.price uses 'Money' scalar, not 'MoneyV2' object
  // So it won't have subfields. Check MoneyV2 fields instead.
  const amountSpent = graph.nodes.find((n) => n.id === 'field:Customer.amountSpent.amount')
  if (amountSpent) {
    const data = amountSpent.data as { depth: number; baseType: string }
    console.log('✓ Customer.amountSpent.amount exists, depth:', data.depth, 'type:', data.baseType)
  } else {
    console.log('✗ Customer.amountSpent.amount not found')
  }

  const metafieldsField = graph.nodes.find((n) => n.id === 'field:Product.metafields')
  console.log(metafieldsField ? '✗ metafields should be excluded' : '✓ metafields correctly excluded')

  // Show MoneyV2 subfield expansion
  console.log('\n=== MoneyV2 Subfield Expansion ===')
  const moneyV2Subfields = graph.nodes.filter(
    (n) =>
      n.data.nodeType === 'field' &&
      (n.id.includes('.amountSpent.') || n.id.includes('.unitCost.'))
  )
  for (const node of moneyV2Subfields) {
    console.log('  ' + node.id)
  }

  // Show sample depth-2 fields grouped by parent
  console.log('\n=== Sample Depth-2 Fields by Parent ===')
  const depth2 = graph.nodes.filter(
    (n) => n.data.nodeType === 'field' && (n.data as { depth: number }).depth === 2
  )
  const byParent: Record<string, string[]> = {}
  for (const n of depth2) {
    const data = n.data as { fullPath: string }
    const parts = data.fullPath.split('.')
    const parent = parts[0] + '.' + parts[1]
    byParent[parent] = byParent[parent] || []
    byParent[parent].push(parts[2])
  }

  const parents = Object.keys(byParent).slice(0, 8)
  for (const p of parents) {
    console.log(`  ${p}: ${byParent[p].join(', ')}`)
  }
}

test()
  .catch(console.error)
  .finally(() => process.exit())
