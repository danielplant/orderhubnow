/**
 * GET/PUT /api/admin/shopify/sync-config/[type]
 *
 * GET: Returns current sync configuration for an entity type
 * PUT: Updates sync configuration (fields and filters)
 *
 * Protected fields cannot be disabled.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/providers'
import { prisma } from '@/lib/prisma'
import { getKnownEntities, isProtectedField, PROTECTED_FIELDS } from '@/lib/shopify/introspect'

interface RouteParams {
  params: Promise<{ type: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
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

  try {
    // Get field configurations
    const fields = await prisma.syncFieldConfig.findMany({
      where: { entityType: type },
      orderBy: [{ displayOrder: 'asc' }, { fieldPath: 'asc' }],
    })

    // Get filter configurations
    const filters = await prisma.syncFilterConfig.findMany({
      where: { entityType: type },
      orderBy: { fieldPath: 'asc' },
    })

    return NextResponse.json({
      success: true,
      entityType: type,
      fields: fields.map((f) => ({
        fieldPath: f.fieldPath,
        fieldType: f.fieldType,
        category: f.category,
        description: f.description,
        enabled: f.enabled,
        isProtected: f.isProtected,
        isMetafield: f.isMetafield,
        accessStatus: f.accessStatus,
        displayOrder: f.displayOrder,
      })),
      filters: filters.map((f) => ({
        fieldPath: f.fieldPath,
        operator: f.operator,
        value: f.value,
        enabled: f.enabled,
      })),
      protectedFields: PROTECTED_FIELDS[type] || [],
    })
  } catch (error) {
    console.error(`Error fetching sync config for ${type}:`, error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

interface FieldUpdate {
  fieldPath: string
  enabled: boolean
}

interface FilterUpdate {
  fieldPath: string
  operator: string
  value: string
  enabled: boolean
}

interface SyncConfigUpdateBody {
  fields?: FieldUpdate[]
  filters?: FilterUpdate[]
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { type } = await params
  const changedBy = session.user.email || session.user.name || 'unknown'

  // Validate entity type
  const knownEntities = getKnownEntities()
  if (!knownEntities.some((e) => e.name === type)) {
    return NextResponse.json({ error: `Unknown entity type: ${type}` }, { status: 400 })
  }

  let body: SyncConfigUpdateBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  try {
    const auditEntries: Array<{
      configType: string
      entityType: string
      fieldPath: string
      action: string
      previousValue: string | null
      newValue: string | null
      changedBy: string
    }> = []

    // Process field updates
    if (body.fields && Array.isArray(body.fields)) {
      for (const fieldUpdate of body.fields) {
        // Check if trying to disable a protected field
        if (!fieldUpdate.enabled && isProtectedField(type, fieldUpdate.fieldPath)) {
          return NextResponse.json(
            { error: `Cannot disable protected field: ${fieldUpdate.fieldPath}` },
            { status: 400 }
          )
        }

        // Get current value for audit
        const current = await prisma.syncFieldConfig.findUnique({
          where: {
            entityType_fieldPath: {
              entityType: type,
              fieldPath: fieldUpdate.fieldPath,
            },
          },
        })

        // Update or create
        await prisma.syncFieldConfig.upsert({
          where: {
            entityType_fieldPath: {
              entityType: type,
              fieldPath: fieldUpdate.fieldPath,
            },
          },
          update: {
            enabled: fieldUpdate.enabled,
            updatedAt: new Date(),
          },
          create: {
            entityType: type,
            fieldPath: fieldUpdate.fieldPath,
            fieldType: 'UNKNOWN',
            enabled: fieldUpdate.enabled,
            isProtected: isProtectedField(type, fieldUpdate.fieldPath),
          },
        })

        // Add audit entry
        if (current?.enabled !== fieldUpdate.enabled) {
          auditEntries.push({
            configType: 'field',
            entityType: type,
            fieldPath: fieldUpdate.fieldPath,
            action: fieldUpdate.enabled ? 'enabled' : 'disabled',
            previousValue: current?.enabled?.toString() ?? null,
            newValue: fieldUpdate.enabled.toString(),
            changedBy,
          })
        }
      }
    }

    // Process filter updates
    if (body.filters && Array.isArray(body.filters)) {
      for (const filterUpdate of body.filters) {
        // Validate operator
        if (!['equals', 'in', 'not_in'].includes(filterUpdate.operator)) {
          return NextResponse.json(
            { error: `Invalid operator: ${filterUpdate.operator}. Must be: equals, in, or not_in` },
            { status: 400 }
          )
        }

        // Get current value for audit
        const current = await prisma.syncFilterConfig.findUnique({
          where: {
            entityType_fieldPath: {
              entityType: type,
              fieldPath: filterUpdate.fieldPath,
            },
          },
        })

        // Update or create
        await prisma.syncFilterConfig.upsert({
          where: {
            entityType_fieldPath: {
              entityType: type,
              fieldPath: filterUpdate.fieldPath,
            },
          },
          update: {
            operator: filterUpdate.operator,
            value: filterUpdate.value,
            enabled: filterUpdate.enabled,
            updatedAt: new Date(),
          },
          create: {
            entityType: type,
            fieldPath: filterUpdate.fieldPath,
            operator: filterUpdate.operator,
            value: filterUpdate.value,
            enabled: filterUpdate.enabled,
          },
        })

        // Add audit entry
        const currentValue = current
          ? JSON.stringify({ operator: current.operator, value: current.value, enabled: current.enabled })
          : null
        const newValue = JSON.stringify({
          operator: filterUpdate.operator,
          value: filterUpdate.value,
          enabled: filterUpdate.enabled,
        })

        if (currentValue !== newValue) {
          auditEntries.push({
            configType: 'filter',
            entityType: type,
            fieldPath: filterUpdate.fieldPath,
            action: current ? 'updated' : 'created',
            previousValue: currentValue,
            newValue,
            changedBy,
          })
        }
      }
    }

    // Write audit entries
    if (auditEntries.length > 0) {
      await prisma.syncConfigAudit.createMany({
        data: auditEntries,
      })
    }

    return NextResponse.json({
      success: true,
      message: 'Configuration updated. Changes will apply on next sync.',
      changesCount: auditEntries.length,
    })
  } catch (error) {
    console.error(`Error updating sync config for ${type}:`, error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
