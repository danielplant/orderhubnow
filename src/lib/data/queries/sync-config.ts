import { prisma } from '@/lib/prisma'

export type SyncRuntimeFlags = {
  ingestionActiveOnly: boolean
  transferActiveOnly: boolean
}

const DEFAULT_FLAGS: SyncRuntimeFlags = {
  ingestionActiveOnly: false,
  transferActiveOnly: false,
}

const RUNTIME_KEYS: Array<keyof SyncRuntimeFlags> = [
  'ingestionActiveOnly',
  'transferActiveOnly',
]

export function getRuntimeKeys(): Array<keyof SyncRuntimeFlags> {
  return [...RUNTIME_KEYS]
}

export async function getSyncRuntimeFlags(
  entityType: string
): Promise<SyncRuntimeFlags> {
  const rows = await prisma.syncRuntimeConfig.findMany({
    where: { entityType },
  })

  const flags: SyncRuntimeFlags = { ...DEFAULT_FLAGS }

  for (const row of rows) {
    const key = row.configKey as keyof SyncRuntimeFlags
    if (RUNTIME_KEYS.includes(key)) {
      flags[key] = row.enabled
    }
  }

  return flags
}
