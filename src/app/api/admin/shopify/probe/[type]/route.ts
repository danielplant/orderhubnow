/**
 * POST /api/admin/shopify/probe/[type]
 *
 * Probes Shopify API to test field accessibility.
 * Updates field access status in database.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/providers'
import { prisma } from '@/lib/prisma'
import { getKnownEntities } from '@/lib/shopify/introspect'
import { probeFields, updateFieldAccessStatus } from '@/lib/shopify/probe'

interface RouteParams {
  params: Promise<{ type: string }>
}

interface ProbeRequestBody {
  fields?: string[] // Optional specific fields to probe
  batchSize?: number
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { type } = await params

  // Validate entity type
  const knownEntities = getKnownEntities()
  if (!knownEntities.some((e) => e.name === type)) {
    return NextResponse.json({ error: `Unknown entity type: ${type}` }, { status: 400 })
  }

  let body: ProbeRequestBody = {}
  try {
    body = await request.json()
  } catch {
    // Body is optional
  }

  try {
    // Get fields to probe
    const fieldsToProbe = await prisma.syncFieldConfig.findMany({
      where: {
        entityType: type,
        ...(body.fields && body.fields.length > 0
          ? { fieldPath: { in: body.fields } }
          : {}),
      },
      select: {
        fieldPath: true,
        fieldType: true,
      },
    })

    if (fieldsToProbe.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No fields to probe',
        results: [],
      })
    }

    // Map to probe format
    const probeTargets = fieldsToProbe.map((f) => ({
      fieldPath: f.fieldPath,
      fieldKind: mapFieldTypeToKind(f.fieldType),
    }))

    // Probe fields
    const probeResult = await probeFields(type, probeTargets, {
      batchSize: body.batchSize ?? 10,
      delayMs: 100,
    })

    // Update database with results
    await updateFieldAccessStatus(type, probeResult.results)

    // Calculate summary
    const accessible = probeResult.results.filter((r) => r.accessStatus === 'accessible').length
    const restricted = probeResult.results.filter((r) => r.accessStatus === 'restricted').length

    return NextResponse.json({
      success: true,
      message: `Probed ${probeResult.results.length} fields: ${accessible} accessible, ${restricted} restricted`,
      results: probeResult.results,
      probeTimestamp: probeResult.probeTimestamp,
      summary: {
        total: probeResult.results.length,
        accessible,
        restricted,
      },
    })
  } catch (error) {
    console.error(`Error probing fields for ${type}:`, error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * Map field type string to GraphQL kind for probe query building
 */
function mapFieldTypeToKind(fieldType: string): string {
  // Common scalar types
  const scalars = ['String', 'Int', 'Float', 'Boolean', 'ID', 'DateTime', 'URL', 'Money', 'Decimal', 'JSON', 'HTML', 'UnsignedInt64']
  if (scalars.includes(fieldType)) {
    return 'SCALAR'
  }

  // Enum types usually end with specific suffixes or are capitalized
  if (fieldType.endsWith('Status') || fieldType.endsWith('Type') || fieldType.endsWith('Sort')) {
    return 'ENUM'
  }

  // Connection types
  if (fieldType.endsWith('Connection')) {
    return 'CONNECTION'
  }

  // Count type
  if (fieldType === 'Count') {
    return 'OBJECT'
  }

  // Default to OBJECT for complex types
  return 'OBJECT'
}
