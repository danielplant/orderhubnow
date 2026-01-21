import { prisma } from '@/lib/prisma'

// ============================================================================
// Status Cascade Config (New Model)
// ============================================================================

/**
 * Cascading status filter configuration.
 * Each stage can only select a subset of the previous stage:
 * Available -> Ingestion -> SKU -> Transfer
 */
export type StatusCascadeConfig = {
  ingestionAllowed: string[] // e.g., ['ACTIVE', 'DRAFT']
  skuAllowed: string[] // subset of ingestionAllowed
  transferAllowed: string[] // subset of skuAllowed
}

const VALID_STATUSES = ['ACTIVE', 'DRAFT', 'ARCHIVED'] as const
export type ProductStatus = (typeof VALID_STATUSES)[number]

const DEFAULT_CASCADE: StatusCascadeConfig = {
  ingestionAllowed: ['ACTIVE', 'DRAFT', 'ARCHIVED'],
  skuAllowed: ['ACTIVE'],
  transferAllowed: ['ACTIVE'],
}

/**
 * Validate that a config respects the cascade constraints:
 * - All values must be valid statuses
 * - skuAllowed must be subset of ingestionAllowed
 * - transferAllowed must be subset of skuAllowed
 */
function validateCascadeConfig(config: StatusCascadeConfig): {
  valid: boolean
  error?: string
} {
  // Check all values are valid statuses
  const allValues = [
    ...config.ingestionAllowed,
    ...config.skuAllowed,
    ...config.transferAllowed,
  ]
  for (const v of allValues) {
    if (!VALID_STATUSES.includes(v as ProductStatus)) {
      return { valid: false, error: `Invalid status: ${v}` }
    }
  }

  // Check skuAllowed is subset of ingestionAllowed
  for (const s of config.skuAllowed) {
    if (!config.ingestionAllowed.includes(s)) {
      return {
        valid: false,
        error: `SKU status '${s}' not in ingestionAllowed`,
      }
    }
  }

  // Check transferAllowed is subset of skuAllowed
  for (const t of config.transferAllowed) {
    if (!config.skuAllowed.includes(t)) {
      return {
        valid: false,
        error: `Transfer status '${t}' not in skuAllowed`,
      }
    }
  }

  return { valid: true }
}

/**
 * Get the status cascade configuration for an entity type.
 * Falls back to defaults if not configured.
 */
export async function getStatusCascadeConfig(
  entityType: string
): Promise<StatusCascadeConfig> {
  const rows = await prisma.syncRuntimeConfig.findMany({
    where: { entityType },
  })

  const config: StatusCascadeConfig = { ...DEFAULT_CASCADE }

  for (const row of rows) {
    if (row.configKey === 'ingestionAllowed') {
      try {
        config.ingestionAllowed = JSON.parse(row.configValue ?? '[]')
      } catch {
        // Keep default
      }
    }
    if (row.configKey === 'skuAllowed') {
      try {
        config.skuAllowed = JSON.parse(row.configValue ?? '[]')
      } catch {
        // Keep default
      }
    }
    if (row.configKey === 'transferAllowed') {
      try {
        config.transferAllowed = JSON.parse(row.configValue ?? '[]')
      } catch {
        // Keep default
      }
    }
  }

  return config
}

/**
 * Set the status cascade configuration for an entity type.
 * Validates cascade constraints before saving.
 */
export async function setStatusCascadeConfig(
  entityType: string,
  config: StatusCascadeConfig
): Promise<{ success: boolean; error?: string }> {
  const validation = validateCascadeConfig(config)
  if (!validation.valid) {
    return { success: false, error: validation.error }
  }

  const keys = ['ingestionAllowed', 'skuAllowed', 'transferAllowed'] as const

  for (const key of keys) {
    await prisma.syncRuntimeConfig.upsert({
      where: {
        entityType_configKey: {
          entityType,
          configKey: key,
        },
      },
      update: {
        configValue: JSON.stringify(config[key]),
        enabled: true,
      },
      create: {
        entityType,
        configKey: key,
        configValue: JSON.stringify(config[key]),
        enabled: true,
      },
    })
  }

  return { success: true }
}

export function getValidStatuses(): readonly string[] {
  return VALID_STATUSES
}

export function getDefaultCascadeConfig(): StatusCascadeConfig {
  return { ...DEFAULT_CASCADE }
}
