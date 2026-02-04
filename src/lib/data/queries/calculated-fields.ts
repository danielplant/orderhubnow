import { prisma } from '@/lib/prisma'

export interface CalculatedFieldRecord {
  id: number
  name: string
  formula: string
  description: string | null
  isSystem: boolean
  createdAt: Date
  updatedAt: Date
}

/**
 * Get all calculated fields
 */
export async function getCalculatedFields(): Promise<CalculatedFieldRecord[]> {
  const fields = await prisma.calculatedField.findMany({
    orderBy: [
      { isSystem: 'desc' }, // System fields first
      { name: 'asc' },
    ],
  })

  return fields.map((f) => ({
    id: f.id,
    name: f.name,
    formula: f.formula,
    description: f.description,
    isSystem: f.isSystem,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
  }))
}

/**
 * Get a single calculated field by ID
 */
export async function getCalculatedFieldById(id: number): Promise<CalculatedFieldRecord | null> {
  const field = await prisma.calculatedField.findUnique({
    where: { id },
  })

  if (!field) return null

  return {
    id: field.id,
    name: field.name,
    formula: field.formula,
    description: field.description,
    isSystem: field.isSystem,
    createdAt: field.createdAt,
    updatedAt: field.updatedAt,
  }
}

/**
 * Check if a calculated field name is already in use
 */
export async function isCalculatedFieldNameTaken(name: string, excludeId?: number): Promise<boolean> {
  // SQL Server uses case-insensitive collation by default, so we just do a simple equals check
  const normalizedName = name.toLowerCase().trim()
  
  const existing = await prisma.calculatedField.findFirst({
    where: {
      name: normalizedName,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  })

  return !!existing
}
