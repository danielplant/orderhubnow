/**
 * GET/PUT /api/admin/shopify/sync-config/[type]
 *
 * GET: Returns current sync configuration for an entity type
 *      Initializes fields from introspection if none exist
 * PUT: Updates sync configuration (fields, filters, and status cascade)
 *
 * Protected fields cannot be disabled.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/providers'
import { prisma } from '@/lib/prisma'
import {
  getKnownEntities,
  isProtectedField,
  PROTECTED_FIELDS,
  introspectEntityType,
  CATEGORY_DEFAULTS,
  type FieldCategory,
} from '@/lib/shopify/introspect'
import {
  getStatusCascadeConfig,
  setStatusCascadeConfig,
  getValidStatuses,
  type StatusCascadeConfig,
} from '@/lib/data/queries/sync-config'

interface RouteParams {
  params: Promise<{ type: string }>
}

// Status cascade keys for the new model
const STATUS_CASCADE_KEYS = ['ingestionAllowed', 'skuAllowed', 'transferAllowed'] as const

/**
 * Initialize field configurations from introspection
 */
async function initializeFieldsFromIntrospection(entityType: string): Promise<void> {
  try {
    const introspection = await introspectEntityType(entityType)

    const fieldConfigs = introspection.fields.map((field, index) => ({
      entityType,
      fieldPath: field.name,
      fieldType: field.baseType,
      category: field.category,
      description: field.description || field.reason,
      enabled: CATEGORY_DEFAULTS[field.category as FieldCategory] ?? false,
      isProtected: isProtectedField(entityType, field.name),
      isMetafield: field.category === 'metafield',
      displayOrder: index,
    }))

    // Upsert all fields
    for (const config of fieldConfigs) {
      await prisma.syncFieldConfig.upsert({
        where: {
          entityType_fieldPath: {
            entityType: config.entityType,
            fieldPath: config.fieldPath,
          },
        },
        update: {
          fieldType: config.fieldType,
          category: config.category,
          description: config.description,
          isProtected: config.isProtected,
          isMetafield: config.isMetafield,
          displayOrder: config.displayOrder,
        },
        create: config,
      })
    }
  } catch (error) {
    console.error(`Failed to initialize fields from introspection for ${entityType}:`, error)
    throw error
  }
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { type } = await params
  const { searchParams } = new URL(request.url)
  const refresh = searchParams.get('refresh') === 'true'

  // Validate entity type
  const knownEntities = getKnownEntities()
  if (!knownEntities.some((e) => e.name === type)) {
    return NextResponse.json({ error: `Unknown entity type: ${type}` }, { status: 400 })
  }

  try {
    // Check if fields exist
    let fields = await prisma.syncFieldConfig.findMany({
      where: { entityType: type },
      orderBy: [{ displayOrder: 'asc' }, { fieldPath: 'asc' }],
    })

    // Initialize from introspection if no fields exist or refresh requested
    if (fields.length === 0 || refresh) {
      await initializeFieldsFromIntrospection(type)
      fields = await prisma.syncFieldConfig.findMany({
        where: { entityType: type },
        orderBy: [{ displayOrder: 'asc' }, { fieldPath: 'asc' }],
      })
    }

    // Get filter configurations
    const filters = await prisma.syncFilterConfig.findMany({
      where: { entityType: type },
      orderBy: { fieldPath: 'asc' },
    })

    // Get status cascade config (new model)
    const statusCascade = await getStatusCascadeConfig(type)

    // Get schema cache info
    const schemaCache = await prisma.shopifySchemaCache.findUnique({
      where: { entityType: type },
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
      // New status cascade config
      statusCascade,
      validStatuses: getValidStatuses(),
      protectedFields: PROTECTED_FIELDS[type] || [],
      schemaInfo: schemaCache
        ? {
            apiVersion: schemaCache.apiVersion,
            fetchedAt: schemaCache.fetchedAt.toISOString(),
          }
        : null,
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

type BulkAction = 'enable-scalars' | 'disable-non-protected' | 'reset'

interface SyncConfigUpdateBody {
  fields?: FieldUpdate[]
  filters?: FilterUpdate[]
  statusCascade?: StatusCascadeConfig
  bulkAction?: BulkAction
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

    // Handle bulk actions
    if (body.bulkAction) {
      const allFields = await prisma.syncFieldConfig.findMany({
        where: { entityType: type },
      })

      let fieldsToUpdate: { fieldPath: string; enabled: boolean }[] = []

      switch (body.bulkAction) {
        case 'enable-scalars': {
          // Enable all scalar, enum, timestamp, count fields
          const scalarCategories = ['scalar', 'enum', 'timestamp', 'count']
          fieldsToUpdate = allFields
            .filter(
              (f) =>
                scalarCategories.includes(f.category || '') && !f.isProtected && !f.enabled
            )
            .map((f) => ({ fieldPath: f.fieldPath, enabled: true }))
          break
        }
        case 'disable-non-protected': {
          // Disable all non-protected fields
          fieldsToUpdate = allFields
            .filter((f) => !f.isProtected && f.enabled)
            .map((f) => ({ fieldPath: f.fieldPath, enabled: false }))
          break
        }
        case 'reset': {
          // Reset to category defaults
          for (const field of allFields) {
            const defaultEnabled =
              CATEGORY_DEFAULTS[field.category as FieldCategory] ?? false
            const shouldBeEnabled = field.isProtected ? true : defaultEnabled
            if (field.enabled !== shouldBeEnabled) {
              fieldsToUpdate.push({ fieldPath: field.fieldPath, enabled: shouldBeEnabled })
            }
          }
          break
        }
      }

      // Apply bulk updates
      for (const update of fieldsToUpdate) {
        const current = allFields.find((f) => f.fieldPath === update.fieldPath)

        await prisma.syncFieldConfig.update({
          where: {
            entityType_fieldPath: {
              entityType: type,
              fieldPath: update.fieldPath,
            },
          },
          data: {
            enabled: update.enabled,
            updatedAt: new Date(),
          },
        })

        auditEntries.push({
          configType: 'field',
          entityType: type,
          fieldPath: update.fieldPath,
          action: `bulk:${body.bulkAction}`,
          previousValue: current?.enabled?.toString() ?? null,
          newValue: update.enabled.toString(),
          changedBy,
        })
      }

      // Write audit entries for bulk action
      if (auditEntries.length > 0) {
        await prisma.syncConfigAudit.createMany({
          data: auditEntries,
        })
      }

      return NextResponse.json({
        success: true,
        message: `Bulk action '${body.bulkAction}' applied to ${fieldsToUpdate.length} fields.`,
        changesCount: fieldsToUpdate.length,
      })
    }

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

    // Process status cascade updates
    if (body.statusCascade) {
      const currentCascade = await getStatusCascadeConfig(type)

      // Validate and save the new cascade config
      const result = await setStatusCascadeConfig(type, body.statusCascade)

      if (!result.success) {
        return NextResponse.json(
          { error: `Invalid status cascade: ${result.error}` },
          { status: 400 }
        )
      }

      // Add audit entries for each changed cascade key
      for (const key of STATUS_CASCADE_KEYS) {
        const prevValue = JSON.stringify(currentCascade[key])
        const newValue = JSON.stringify(body.statusCascade[key])

        if (prevValue !== newValue) {
          auditEntries.push({
            configType: 'statusCascade',
            entityType: type,
            fieldPath: key,
            action: 'updated',
            previousValue: prevValue,
            newValue: newValue,
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
